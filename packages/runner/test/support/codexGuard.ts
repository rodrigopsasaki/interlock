import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { launchToken, platformProcessTable, registerLaunch } from "./codexSupervisor.ts";

interface Provider {
  readonly baseUrl: string | undefined;
}

interface ParsedConfig {
  readonly provider: string | undefined;
  readonly profile: string | undefined;
  readonly providers: ReadonlyMap<string, Provider>;
}

interface ParsedCommand {
  readonly global: readonly string[];
  readonly selectors: readonly string[];
  readonly subcommand: string | undefined;
  readonly rest: readonly string[];
}

function stringValue(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      return typeof parsed === "string" ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1);
  return undefined;
}

function tableParts(value: string): readonly string[] | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return undefined;
  const body = trimmed.slice(1, -1).trim();
  if (body.length === 0) return [];
  const parts = body.split(".").map((part) => part.trim());
  return parts.every((part) => part.length > 0) ? parts : undefined;
}

function stripComment(value: string): string {
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === "#") return value.slice(0, index);
  }
  return value;
}

function parseConfig(text: string): ParsedConfig {
  let provider: string | undefined;
  let profile: string | undefined;
  let table: readonly string[] = [];
  const providers = new Map<string, Provider>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripComment(rawLine).trim();
    if (line.length === 0) continue;
    if (line.startsWith("[")) {
      const parts = tableParts(line);
      if (parts === undefined) throw new Error("malformed TOML table");
      table = parts;
      continue;
    }
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    if (key.length === 0) continue;
    if (table.length === 0 && key === "model_provider") {
      const value = stringValue(rawValue);
      if (value === undefined) throw new Error("malformed model_provider");
      provider = value;
    } else if (table.length === 0 && key === "profile") {
      const value = stringValue(rawValue);
      if (value === undefined) throw new Error("malformed profile");
      profile = value;
    } else if (table.length === 2 && table[0] === "model_providers" && key === "base_url") {
      const value = stringValue(rawValue);
      if (value === undefined) throw new Error("malformed base_url");
      providers.set(table[1] ?? "", { baseUrl: value });
    }
  }
  return { provider, profile, providers };
}

function readConfig(path: string): ParsedConfig | undefined {
  if (!existsSync(path)) return undefined;
  if (!statSync(path).isFile()) throw new Error(`${path} is not a regular file`);
  return parseConfig(readFileSync(path, "utf8"));
}

function configHome(): string {
  return process.env["CODEX_HOME"] ?? join(process.env["HOME"] ?? ".", ".codex");
}

function parseCommand(args: readonly string[]): ParsedCommand {
  const global: string[] = [];
  const selectors: string[] = [];
  let index = 0;
  while (index < args.length) {
    const argument = args[index];
    if (
      argument === "--profile" ||
      argument === "-p" ||
      argument === "-c" ||
      argument === "--config"
    ) {
      const value = args[index + 1];
      if (value === undefined) return { global, selectors, subcommand: undefined, rest: [] };
      global.push(argument, value);
      if (argument === "-c" || argument === "--config") selectors.push(value);
      index += 2;
      continue;
    }
    if (argument?.startsWith("--profile=")) {
      global.push("--profile", argument.slice("--profile=".length));
      index += 1;
      continue;
    }
    break;
  }
  const subcommand = args[index];
  return { global, selectors, subcommand, rest: args.slice(index + 1) };
}

function selectedProfile(
  command: ParsedCommand,
  base: ParsedConfig | undefined,
): string | undefined {
  for (let index = 0; index < command.global.length; index += 2) {
    const flag = command.global[index];
    const value = command.global[index + 1];
    if ((flag === "--profile" || flag === "-p") && value !== undefined) return value;
  }
  return base?.profile;
}

function selectorTouchesProvider(selector: string): boolean {
  const separator = selector.indexOf("=");
  const key = (separator < 0 ? selector : selector.slice(0, separator)).trim();
  return (
    key === "model_provider" ||
    key.startsWith("model_provider.") ||
    key === "model_providers" ||
    key.startsWith("model_providers.") ||
    key === "base_url" ||
    key.endsWith(".base_url")
  );
}

function providerBaseUrl(command: ParsedCommand): {
  readonly name: string;
  readonly url: string | undefined;
} {
  const home = configHome();
  const basePath = join(home, "config.toml");
  const base = readConfig(basePath);
  const profile = selectedProfile(command, base);
  const configs: ParsedConfig[] = [];
  if (base !== undefined) configs.push(base);
  if (profile !== undefined) {
    const profilePath = join(home, `${profile}.config.toml`);
    if (!existsSync(profilePath))
      throw new Error(`${profilePath}: selected Codex profile cannot be read`);
    const selected = readConfig(profilePath);
    if (selected === undefined)
      throw new Error(`${profilePath}: selected Codex profile cannot be read`);
    configs.push(selected);
  }
  const project = readConfig(join(resolve(process.cwd()), ".codex", "config.toml"));
  if (project !== undefined) configs.push(project);
  let name: string | undefined;
  const providers = new Map<string, Provider>();
  for (const config of configs) {
    if (config.provider !== undefined) name = config.provider;
    for (const [providerName, value] of config.providers) {
      providers.set(providerName, value);
    }
  }
  if (name === undefined) name = "default";
  return { name, url: providers.get(name)?.baseUrl };
}

function loopback(url: string): boolean {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

function refuse(form: string, reason: string): never {
  process.stderr.write(`codex ${form} refused: ${reason}\n`);
  process.exit(2);
}

function realCodex(): string {
  const current = process.env["INTERLOCK_CODEX_GUARD_DIR"];
  const path = process.env["PATH"] ?? "";
  for (const directory of path.split(":")) {
    if (
      directory.length === 0 ||
      directory === current ||
      directory.split("/").at(-1)?.startsWith("codex-guard-") === true
    )
      continue;
    const candidate = join(directory, "codex");
    try {
      if (!statSync(candidate).isFile()) continue;
      if (realpathSync(candidate) === resolve(import.meta.filename)) continue;
      return candidate;
    } catch {}
  }
  refuse("launch", "the real codex executable is not available past the guard");
}

function start(args: readonly string[]): void {
  const executable = realCodex();
  const token = launchToken();
  const registry = process.env["INTERLOCK_CODEX_GUARD_REGISTRY"];
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    INTERLOCK_CODEX_LAUNCH_TOKEN: token,
  };
  const pathAfterGuard = (environment["PATH"] ?? "")
    .split(delimiter)
    .filter((entry) => entry !== process.env["INTERLOCK_CODEX_GUARD_DIR"])
    .join(delimiter);
  const child = spawn("codex", args, {
    cwd: process.cwd(),
    env: { ...environment, PATH: [dirname(executable), pathAfterGuard].join(delimiter) },
    stdio: "inherit",
    detached: true,
  });
  if (child.pid === undefined) refuse("launch", "the real codex did not expose a pid");
  if (registry !== undefined) {
    const processRecord = platformProcessTable()
      .list()
      .find((entry) => entry.pid === child.pid);
    registerLaunch(
      registry,
      child.pid,
      processRecord?.pgid ?? child.pid,
      processRecord?.startTime ?? "unknown",
      token,
    );
  }
  child.once("error", (error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    process.exitCode = code ?? (signal === null ? 1 : 1);
  });
}

function main(args: readonly string[]): void {
  const command = parseCommand(args);
  if (command.subcommand === undefined) refuse("unknown form", "no command form was supplied");
  if (command.subcommand === "mcp") {
    if (command.rest.length === 1 && command.rest[0] === "list") start(args);
    else if (
      command.rest.length === 2 &&
      command.rest[0] === "list" &&
      command.rest[1] === "--json"
    )
      start(args);
    else refuse("mcp", "only `mcp list` and `mcp list --json` are allowed");
    return;
  }
  if (command.subcommand !== "exec")
    refuse(command.subcommand, "this command form is not allowed in tests");
  if (command.rest.length === 0) refuse("exec", "the exec form needs a prompt");
  for (const selector of command.selectors) {
    if (selectorTouchesProvider(selector))
      refuse("exec", `selector touches provider configuration: ${selector}`);
  }
  let resolved: { readonly name: string; readonly url: string | undefined };
  try {
    resolved = providerBaseUrl(command);
  } catch (error) {
    refuse(
      "exec",
      error instanceof Error ? error.message : "Codex configuration could not be parsed",
    );
  }
  if (resolved.url === undefined) refuse("exec", `provider "${resolved.name}" has no base_url`);
  try {
    if (!loopback(resolved.url))
      refuse("exec", `provider "${resolved.name}" has a non-loopback base_url`);
  } catch {
    refuse("exec", `provider "${resolved.name}" has a malformed base_url`);
  }
  start(args);
}

main(process.argv.slice(2));

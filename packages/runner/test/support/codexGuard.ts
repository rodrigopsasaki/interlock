import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { launchToken, platformProcessTable, registerLaunch } from "./codexSupervisor.ts";

interface Provider {
  readonly baseUrl: string | undefined;
}

interface ProviderOverlay {
  provider: string | undefined;
  readonly providers: Map<string, Provider>;
}

interface ParsedConfig {
  readonly root: ProviderOverlay;
  readonly profile: string | undefined;
  readonly profiles: ReadonlyMap<string, ProviderOverlay>;
}

interface ParsedCommand {
  readonly global: readonly string[];
  readonly selectors: readonly string[];
  readonly profiles: readonly string[];
  readonly subcommand: string | undefined;
  readonly rest: readonly string[];
  readonly unknownOptions: readonly string[];
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

function keyParts(value: string): readonly string[] | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.includes('"') || trimmed.includes("'")) return undefined;
  const parts = trimmed.split(".");
  return parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part)) ? parts : undefined;
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

function emptyOverlay(): ProviderOverlay {
  return { provider: undefined, providers: new Map() };
}

function overlayFor(
  table: readonly string[],
  root: ProviderOverlay,
  profiles: Map<string, ProviderOverlay>,
): { readonly overlay: ProviderOverlay; readonly providerName: string | undefined } | undefined {
  if (table.length === 0) return { overlay: root, providerName: undefined };
  if (table.length === 2 && table[0] === "model_providers" && table[1] !== undefined) {
    return { overlay: root, providerName: table[1] };
  }
  if (table.length === 2 && table[0] === "profiles" && table[1] !== undefined) {
    const overlay = profiles.get(table[1]) ?? emptyOverlay();
    profiles.set(table[1], overlay);
    return { overlay, providerName: undefined };
  }
  if (
    table.length === 4 &&
    table[0] === "profiles" &&
    table[1] !== undefined &&
    table[2] === "model_providers" &&
    table[3] !== undefined
  ) {
    const overlay = profiles.get(table[1]) ?? emptyOverlay();
    profiles.set(table[1], overlay);
    return { overlay, providerName: table[3] };
  }
  return undefined;
}

function parsedString(key: string, rawValue: string): string {
  const value = stringValue(rawValue);
  if (value === undefined) throw new Error(`unsupported Codex configuration value for ${key}`);
  return value;
}

function ignoredTable(table: readonly string[]): boolean {
  if (table[0] === "mcp_servers" && table[1] !== undefined) return true;
  if (table[0] === "shell_environment_policy" && (table.length === 1 || table[1] === "set"))
    return true;
  return table[0] === "profiles" && table[2] === "mcp_servers" && table[3] !== undefined;
}

function validIgnoredValue(value: string): boolean {
  const trimmed = value.trim();
  if (stringValue(trimmed) !== undefined) return true;
  return (
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}"))
  );
}

function parseConfig(text: string): ParsedConfig {
  const root = emptyOverlay();
  let profile: string | undefined;
  let table: readonly string[] = [];
  const profiles = new Map<string, ProviderOverlay>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripComment(rawLine).trim();
    if (line.length === 0) continue;
    if (line.startsWith("[")) {
      if (line.startsWith("[[") || !line.endsWith("]"))
        throw new Error("unsupported Codex configuration table");
      const parts = keyParts(line.slice(1, -1));
      if (
        parts === undefined ||
        (overlayFor(parts, root, profiles) === undefined && !ignoredTable(parts))
      )
        throw new Error(`unsupported Codex configuration table: ${line}`);
      table = parts;
      continue;
    }
    const separator = line.indexOf("=");
    if (separator < 1) throw new Error(`unsupported Codex configuration line: ${line}`);
    const key = keyParts(line.slice(0, separator));
    const rawValue = line.slice(separator + 1).trim();
    if (key === undefined || key.length !== 1)
      throw new Error(`unsupported Codex configuration key: ${line}`);
    const target = overlayFor(table, root, profiles);
    if (target === undefined) {
      if (ignoredTable(table) && validIgnoredValue(rawValue)) continue;
      throw new Error(`unsupported Codex configuration key: ${line}`);
    }
    const name = key[0];
    if (name === "model_provider" && target.providerName === undefined) {
      target.overlay.provider = parsedString(name, rawValue);
    } else if (name === "profile" && table.length === 0) {
      profile = parsedString(name, rawValue);
    } else if (name === "base_url" && target.providerName !== undefined) {
      target.overlay.providers.set(target.providerName, { baseUrl: parsedString(name, rawValue) });
    } else if (target.providerName === undefined && name === "model") {
      parsedString(name, rawValue);
    } else if (
      target.providerName !== undefined &&
      (name === "name" || name === "wire_api" || name === "env_key")
    ) {
      parsedString(name, rawValue);
    } else {
      throw new Error(`unsupported Codex configuration key: ${line}`);
    }
  }
  return { root, profile, profiles };
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
  const profiles: string[] = [];
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
      if (value === undefined)
        return {
          global,
          selectors,
          profiles,
          subcommand: undefined,
          rest: [],
          unknownOptions: [],
        };
      global.push(argument, value);
      if (argument === "-c" || argument === "--config") selectors.push(value);
      if (argument === "-p" || argument === "--profile") profiles.push(value);
      index += 2;
      continue;
    }
    if (argument?.startsWith("--profile=")) {
      global.push("--profile", argument.slice("--profile=".length));
      profiles.push(argument.slice("--profile=".length));
      index += 1;
      continue;
    }
    break;
  }
  const subcommand = args[index];
  if (subcommand !== "exec")
    return {
      global,
      selectors,
      profiles,
      subcommand,
      rest: args.slice(index + 1),
      unknownOptions: [],
    };
  const rest: string[] = [];
  const unknownOptions: string[] = [];
  for (let cursor = index + 1; cursor < args.length; cursor += 1) {
    const argument = args[cursor];
    if (
      argument === "-p" ||
      argument === "--profile" ||
      argument === "-c" ||
      argument === "--config"
    ) {
      const value = args[cursor + 1];
      if (value === undefined) {
        unknownOptions.push(argument);
        continue;
      }
      global.push(argument, value);
      if (argument === "-p" || argument === "--profile") profiles.push(value);
      else selectors.push(value);
      cursor += 1;
    } else if (argument?.startsWith("--profile=")) {
      global.push("--profile", argument.slice("--profile=".length));
      profiles.push(argument.slice("--profile=".length));
    } else if (argument?.startsWith("--config=")) {
      global.push("--config", argument.slice("--config=".length));
      selectors.push(argument.slice("--config=".length));
    } else if (argument === "--skip-git-repo-check") {
      rest.push(argument);
    } else if (argument?.startsWith("-")) {
      unknownOptions.push(argument);
    } else if (argument !== undefined) {
      rest.push(argument);
    }
  }
  return { global, selectors, profiles, subcommand, rest, unknownOptions };
}

function selectedProfile(
  command: ParsedCommand,
  base: ParsedConfig | undefined,
): string | undefined {
  const selected = command.profiles[0];
  if (selected !== undefined) return selected;
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
    const inlineProfile = base?.profiles.has(profile) === true;
    if (!existsSync(profilePath) && !inlineProfile)
      throw new Error(`${profilePath}: selected Codex profile cannot be read`);
    if (existsSync(profilePath)) {
      const selected = readConfig(profilePath);
      if (selected === undefined)
        throw new Error(`${profilePath}: selected Codex profile cannot be read`);
      configs.push(selected);
    }
  }
  const project = readConfig(join(resolve(process.cwd()), ".codex", "config.toml"));
  if (project !== undefined) configs.push(project);
  let name: string | undefined;
  const providers = new Map<string, Provider>();
  for (const config of configs) {
    const overlays = [config.root];
    const profileOverlay = profile === undefined ? undefined : config.profiles.get(profile);
    if (profileOverlay !== undefined) overlays.push(profileOverlay);
    for (const overlay of overlays) {
      if (overlay.provider !== undefined) name = overlay.provider;
      for (const [providerName, value] of overlay.providers) {
        providers.set(providerName, value);
      }
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
    let processRecord = platformProcessTable()
      .list()
      .find((entry) => entry.pid === child.pid);
    for (let attempt = 0; processRecord === undefined && attempt < 2; attempt += 1) {
      processRecord = platformProcessTable()
        .list()
        .find((entry) => entry.pid === child.pid);
    }
    if (processRecord === undefined || processRecord.startTime === "unknown") {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {}
      refuse("launch", "the guarded Codex start time could not be read");
    }
    registerLaunch(registry, child.pid, processRecord.pgid, processRecord.startTime, token);
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
  if (command.unknownOptions.length > 0)
    refuse("exec", `unknown option: ${command.unknownOptions[0]}`);
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

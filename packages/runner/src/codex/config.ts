import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { err, ok, type Result } from "@phyxiusjs/fp";

interface ServerConfig {
  command: boolean | undefined;
  url: boolean | undefined;
}

interface ParsedConfig {
  readonly base: ReadonlyMap<string, ServerConfig>;
  readonly profileServers: ReadonlyMap<string, ServerConfig>;
  readonly profile: string | undefined;
}

export const CODEX_CANONICAL_LINE_LIMIT = 1024;

function configHome(environment: Readonly<Record<string, string>>): string {
  return environment["CODEX_HOME"] ?? join(homedir(), ".codex");
}

function quotedPart(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed[0] !== '"' || trimmed.at(-1) !== '"') return undefined;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return typeof parsed === "string" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function pathParts(value: string): readonly string[] | undefined {
  const parts: string[] = [];
  let start = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ".") {
      const part = value.slice(start, index).trim();
      const parsed = part.startsWith('"') ? quotedPart(part) : part;
      if (parsed === undefined || parsed.length === 0) return undefined;
      parts.push(parsed);
      start = index + 1;
    }
  }
  if (quoted) return undefined;
  const last = value.slice(start).trim();
  const parsed = last.startsWith('"') ? quotedPart(last) : last;
  if (parsed === undefined || parsed.length === 0) return undefined;
  parts.push(parsed);
  return parts;
}

function stringValue(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith('"')) return undefined;
  return quotedPart(trimmed);
}

function parseConfig(
  text: string,
  activeProfile: string | undefined,
  profileLayer = false,
): ParsedConfig {
  const base = new Map<string, ServerConfig>();
  const profileServers = new Map<string, ServerConfig>();
  let table: readonly string[] = [];
  let profileTable = false;
  let profile: string | undefined;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]") && !trimmed.startsWith("[[")) {
      table = pathParts(trimmed.slice(1, -1)) ?? [];
      profileTable =
        (profileLayer && table[0] === "mcp_servers" && table.length === 2) ||
        (table[0] === "profiles" && table[2] === "mcp_servers" && table.length === 4 &&
          (activeProfile === undefined || table[1] === activeProfile));
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (table.length === 0 && key === "profile") profile = stringValue(value);
    const rootServer = table[0] === "mcp_servers" && table.length === 2 ? table[1] : undefined;
    const profileServer =
      table[0] === "profiles" && table[2] === "mcp_servers" && table.length === 4 &&
      (activeProfile === undefined || table[1] === activeProfile)
        ? table[3]
        : undefined;
    const name = rootServer ?? profileServer;
    if (name === undefined) continue;
    const target = profileTable ? profileServers : base;
    const current = target.get(name) ?? { command: undefined, url: undefined };
    if (key === "command") current.command = true;
    if (key === "url") current.url = true;
    target.set(name, current);
  }
  return { base, profileServers, profile };
}

function activeProfileFromArgs(args: readonly string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) continue;
    if (argument === "--profile") return args[index + 1];
    if (argument.startsWith("--profile=")) return argument.slice("--profile=".length);
  }
  return undefined;
}

function mergeConfig(target: Map<string, ServerConfig>, source: ReadonlyMap<string, ServerConfig>) {
  for (const [name, config] of source) {
    const current = target.get(name) ?? { command: undefined, url: undefined };
    if (config.command !== undefined) current.command = config.command;
    if (config.url !== undefined) current.url = config.url;
    target.set(name, current);
  }
}

export function configuredCodexMcpServers(
  args: readonly string[],
  environment: Readonly<Record<string, string>>,
): Result<readonly string[], string> {
  const home = configHome(environment);
  const configPath = join(home, "config.toml");
  if (!existsSync(configPath)) return ok([]);
  let parsed: ParsedConfig;
  try {
    parsed = parseConfig(readFileSync(configPath, "utf8"), activeProfileFromArgs(args));
  } catch (error) {
    return err(error instanceof Error ? error.message : "could not read Codex config.toml");
  }
  const activeProfile = activeProfileFromArgs(args) ?? parsed.profile;
  const servers = new Map(parsed.base);
  mergeConfig(servers, parsed.profileServers);
  if (activeProfile !== undefined) {
    const profilePath = join(home, `${activeProfile}.config.toml`);
    if (existsSync(profilePath)) {
      try {
        const profile = parseConfig(readFileSync(profilePath, "utf8"), activeProfile, true);
        mergeConfig(servers, profile.base);
        mergeConfig(servers, profile.profileServers);
      } catch (error) {
        return err(error instanceof Error ? error.message : `could not read ${profilePath}`);
      }
    }
  }
  return ok(
    [...servers]
      .filter(([, config]) => config.command === true && config.url !== true)
      .map(([name]) => name),
  );
}

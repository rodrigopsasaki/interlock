import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  statSync,
  symlinkSync,
  type Stats,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import { execFileSyncOwned } from "../ownedCommand.ts";
import { agentEnvironmentArgs } from "./environment.ts";

export const CODEX_CANONICAL_LINE_LIMIT = 1024;

interface ServerConfig {
  command: boolean | undefined;
  url: boolean | undefined;
  readonly markerValues: Map<string, string>;
}

interface ParsedConfig {
  readonly servers: ReadonlyMap<string, ServerConfig>;
  readonly profile: string | undefined;
}

interface ConfigSnapshot {
  readonly servers: ReadonlyMap<string, ServerConfig>;
  readonly profile: string | undefined;
  readonly baseText: string;
  readonly profileText: string | undefined;
  readonly projectShellEnvironmentKeys: ReadonlySet<string>;
}

export interface CodexLaunchOptions {
  readonly listCodexMcp?: (
    cwd: string,
    environment: Readonly<Record<string, string>>,
  ) => Result<readonly string[], string>;
  readonly narrate?: (line: string) => void;
  readonly program?: string;
  readonly journalPath?: string;
}

export interface CodexLaunchRefusal {
  readonly kind: "codex-launch-refusal";
  readonly servers: readonly string[];
  readonly because: string;
}

export interface CodexPreparedLaunch {
  readonly kind: "delivered";
  readonly path: "argv" | "overlay";
  readonly args: readonly string[];
  readonly environment: Readonly<Record<string, string>>;
  readonly servers: readonly string[];
  readonly cleanup: (terminationConfirmed: boolean) => void;
}

function configHome(environment: Readonly<Record<string, string>>): string {
  return environment["CODEX_HOME"] ?? join(homedir(), ".codex");
}

function newServer(): ServerConfig {
  return { command: undefined, url: undefined, markerValues: new Map() };
}

function quotedPart(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length < 2) return undefined;
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

function withoutComment(value: string): string {
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === "#") return value.slice(0, index).trim();
  }
  return value.trim();
}

function splitTopLevel(value: string): readonly string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
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
    else if (character === "[" || character === "{") depth += 1;
    else if (character === "]" || character === "}") depth -= 1;
    else if (character === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts.filter((part) => part.length > 0);
}

function stringValue(value: string): string | undefined {
  return quotedPart(withoutComment(value));
}

function markerTableValue(value: string): ReadonlyMap<string, string> {
  const trimmed = withoutComment(value);
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return new Map();
  const entries = new Map<string, string>();
  for (const part of splitTopLevel(trimmed.slice(1, -1))) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = pathParts(part.slice(0, separator).trim())?.[0];
    const parsed = stringValue(part.slice(separator + 1));
    if (key !== undefined && parsed !== undefined) entries.set(key, parsed);
  }
  return entries;
}

function inlineSetKeys(value: string): ReadonlySet<string> {
  const trimmed = withoutComment(value);
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return new Set();
  const keys = new Set<string>();
  for (const part of splitTopLevel(trimmed.slice(1, -1))) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = pathParts(part.slice(0, separator).trim());
    const nested = withoutComment(part.slice(separator + 1));
    if (key?.[0] !== "set" || !nested.startsWith("{") || !nested.endsWith("}")) continue;
    for (const nestedPart of splitTopLevel(nested.slice(1, -1))) {
      const nestedSeparator = nestedPart.indexOf("=");
      if (nestedSeparator < 0) continue;
      const nestedKey = pathParts(nestedPart.slice(0, nestedSeparator).trim())?.[0];
      if (nestedKey !== undefined) keys.add(nestedKey);
    }
  }
  return keys;
}

function serverPath(
  table: readonly string[],
): { readonly name: string; readonly rest: readonly string[] } | undefined {
  if (table[0] === "mcp_servers" && table[1] !== undefined) {
    return { name: table[1], rest: table.slice(2) };
  }
  if (table[0] === "profiles" && table[2] === "mcp_servers" && table[3] !== undefined) {
    return { name: table[3], rest: table.slice(4) };
  }
  return undefined;
}

function applyServerValue(server: ServerConfig, path: readonly string[], value: string): void {
  const first = path[0];
  if (first === "command") server.command = true;
  if (first === "url") server.url = true;
  if (first === "env" && path[1] !== undefined) {
    const key = path[1];
    if (key === "INTERLOCK_SESSION" || key === "INTERLOCK_GRAPH" || key === "INTERLOCK_NODE") {
      const parsed = stringValue(value);
      if (parsed !== undefined) server.markerValues.set(key, parsed);
    }
  }
  if (first === "env") {
    for (const [key, marker] of markerTableValue(value)) server.markerValues.set(key, marker);
  }
}

function parseConfig(text: string): ParsedConfig {
  const servers = new Map<string, ServerConfig>();
  let table: readonly string[] = [];
  let profile: string | undefined;
  for (const sourceLine of text.split(/\r?\n/)) {
    const line = withoutComment(sourceLine);
    if (line.startsWith("[") && line.endsWith("]") && !line.startsWith("[[")) {
      table = pathParts(line.slice(1, -1)) ?? [];
      continue;
    }
    const separator = line.indexOf("=");
    if (separator < 0) continue;
    const key = pathParts(line.slice(0, separator).trim());
    const value = line.slice(separator + 1).trim();
    if (table.length === 0 && key?.[0] === "profile") profile = stringValue(value);
    const server = serverPath(table);
    if (server === undefined || key === undefined) continue;
    const current = servers.get(server.name) ?? newServer();
    applyServerValue(current, [...server.rest, ...key], value);
    servers.set(server.name, current);
  }
  return { servers, profile };
}

function shellEnvironmentKeys(text: string): ReadonlySet<string> {
  const keys = new Set<string>();
  let table: readonly string[] = [];
  for (const sourceLine of text.split(/\r?\n/)) {
    const line = withoutComment(sourceLine);
    if (line.startsWith("[") && line.endsWith("]") && !line.startsWith("[[")) {
      table = pathParts(line.slice(1, -1)) ?? [];
      continue;
    }
    const separator = line.indexOf("=");
    if (separator < 0) continue;
    const key = pathParts(line.slice(0, separator).trim());
    if (key === undefined) continue;
    const path = [...table, ...key];
    if (path[0] === "shell_environment_policy" && path[1] === "set" && path[2] !== undefined) {
      keys.add(path[2]);
    } else if (path[0] === "shell_environment_policy" && path[1] === "set") {
      for (const inlineKey of inlineSetKeys(line.slice(separator + 1))) {
        keys.add(inlineKey);
      }
    }
  }
  return keys;
}

function mergeServers(
  target: Map<string, ServerConfig>,
  source: ReadonlyMap<string, ServerConfig>,
): void {
  for (const [name, incoming] of source) {
    const current = target.get(name) ?? newServer();
    if (incoming.command !== undefined) current.command = incoming.command;
    if (incoming.url !== undefined) current.url = incoming.url;
    for (const [key, value] of incoming.markerValues) current.markerValues.set(key, value);
    target.set(name, current);
  }
}

function profileFromArgs(args: readonly string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) continue;
    if (argument === "--profile" || argument === "-p") return args[index + 1];
    if (argument.startsWith("--profile=")) return argument.slice("--profile=".length);
  }
  return undefined;
}

function configSelectors(args: readonly string[]): readonly string[] {
  const selectors: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "-c" || argument === "--config") {
      const selector = args[index + 1];
      if (selector !== undefined) selectors.push("-c", selector);
      index += 1;
    } else if (argument?.startsWith("--config=")) {
      selectors.push("--config", argument.slice("--config=".length));
    }
  }
  return selectors;
}

function selectorShellEnvironmentKeys(args: readonly string[]): ReadonlySet<string> {
  const keys = new Set<string>();
  const selectors = configSelectors(args);
  for (let index = 0; index < selectors.length; index += 2) {
    const selector = selectors[index + 1];
    if (selector === undefined) continue;
    const separator = selector.indexOf("=");
    if (separator < 0) continue;
    const path = pathParts(selector.slice(0, separator));
    if (path?.[0] === "shell_environment_policy" && path[1] === "set" && path[2] !== undefined) {
      keys.add(path[2]);
    }
  }
  return keys;
}

function applySelectors(servers: Map<string, ServerConfig>, args: readonly string[]): void {
  const selectors = configSelectors(args);
  for (let index = 0; index < selectors.length; index += 2) {
    const selector = selectors[index + 1];
    if (selector === undefined) continue;
    const separator = selector.indexOf("=");
    if (separator < 0) continue;
    const path = pathParts(selector.slice(0, separator));
    if (path?.[0] !== "mcp_servers" || path[1] === undefined) continue;
    const current = servers.get(path[1]) ?? newServer();
    applyServerValue(current, path.slice(2), selector.slice(separator + 1));
    servers.set(path[1], current);
  }
}

function readConfig(path: string): Result<string | undefined, string> {
  if (!existsSync(path)) return ok(undefined);
  try {
    if (!statSync(path).isFile()) return err(`${path} is not a regular file`);
    return ok(readFileSync(path, "utf8"));
  } catch (error) {
    return err(`${path}: ${error instanceof Error ? error.message : "could not be read"}`);
  }
}

function projectConfigPaths(cwd: string): readonly string[] {
  return [join(resolve(cwd), ".codex", "config.toml")];
}

function snapshotConfig(
  cwd: string,
  args: readonly string[],
  environment: Readonly<Record<string, string>>,
): Result<ConfigSnapshot, string> {
  const home = configHome(environment);
  const base = readConfig(join(home, "config.toml"));
  if (isErr(base)) return base;
  const baseText = base.value ?? "";
  const baseParsed = parseConfig(baseText);
  const selectedProfile = profileFromArgs(args) ?? baseParsed.profile;
  let profileText: string | undefined;
  const servers = new Map<string, ServerConfig>();
  const projectShellEnvironmentKeys = new Set<string>();
  mergeServers(servers, baseParsed.servers);
  if (selectedProfile !== undefined) {
    const profile = readConfig(join(home, `${selectedProfile}.config.toml`));
    if (isErr(profile)) return profile;
    if (profile.value === undefined) {
      return err(
        `${join(home, `${selectedProfile}.config.toml`)}: selected Codex profile cannot be read`,
      );
    }
    profileText = profile.value;
    mergeServers(servers, parseConfig(profile.value).servers);
  }
  for (const projectPath of projectConfigPaths(cwd)) {
    const project = readConfig(projectPath);
    if (isErr(project)) return project;
    if (project.value !== undefined) {
      const parsed = parseConfig(project.value);
      mergeServers(servers, parsed.servers);
      for (const key of shellEnvironmentKeys(project.value)) {
        projectShellEnvironmentKeys.add(key);
      }
    }
  }
  applySelectors(servers, args);
  return ok({
    servers,
    profile: selectedProfile,
    baseText,
    profileText,
    projectShellEnvironmentKeys,
  });
}

function refusal(servers: readonly string[], because: string): Result<never, CodexLaunchRefusal> {
  return err({ kind: "codex-launch-refusal", servers, because });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function codexMcpServers(value: unknown): Result<readonly string[], string> {
  const entries = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value["servers"])
      ? value["servers"]
      : undefined;
  if (entries === undefined) return err("the output was not a server list");
  const names: string[] = [];
  for (const entry of entries) {
    if (!isRecord(entry) || typeof entry["name"] !== "string") continue;
    const transport = entry["transport"];
    const transportType = isRecord(transport) ? transport["type"] : transport;
    if (transportType === "stdio") names.push(entry["name"]);
  }
  return ok(names);
}

function discoverCodexMcpServers(
  cwd: string,
  args: readonly string[],
  environment: Readonly<Record<string, string>>,
): Result<readonly string[], string> {
  try {
    const output = execFileSyncOwned("codex", [...configSelectors(args), "mcp", "list", "--json"], {
      cwd,
      env: { ...process.env, ...environment },
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    return codexMcpServers(JSON.parse(output));
  } catch (error) {
    return err(error instanceof Error ? error.message : "invalid JSON");
  }
}

function quotedConfigKey(value: string): string {
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : JSON.stringify(value);
}

function markerLines(
  servers: readonly string[],
  environment: Readonly<Record<string, string>>,
): string {
  return servers
    .flatMap((server) => [
      `[mcp_servers.${quotedConfigKey(server)}.env]`,
      ...["INTERLOCK_SESSION", "INTERLOCK_GRAPH", "INTERLOCK_NODE"].map(
        (key) => `${quotedConfigKey(key)} = ${JSON.stringify(environment[key] ?? "")}`,
      ),
    ])
    .join("\n");
}

function shellEnvironmentLines(environment: Readonly<Record<string, string>>): string {
  const entries = Object.entries(environment);
  if (entries.length === 0) return "";
  return [
    "[shell_environment_policy.set]",
    ...entries.map(([key, value]) => `${quotedConfigKey(key)} = ${JSON.stringify(value)}`),
  ].join("\n");
}

function generatedShellEnvironmentArgs(
  environment: Readonly<Record<string, string>>,
  keptKeys: ReadonlySet<string>,
): readonly string[] {
  const generated = agentEnvironmentArgs("codex", [], environment, []);
  const result: string[] = [];
  for (let index = 0; index < generated.length; index += 2) {
    const argument = generated[index];
    const value = generated[index + 1];
    if (argument !== "-c" || value === undefined) continue;
    const separator = value.indexOf("=");
    if (separator < 0) continue;
    const path = pathParts(value.slice(0, separator));
    if (
      path?.[0] === "shell_environment_policy" &&
      path[1] === "set" &&
      path[2] !== undefined &&
      keptKeys.has(path[2])
    ) {
      result.push(argument, value);
    }
  }
  return result;
}

function replaceProfile(args: readonly string[], profile: string): readonly string[] {
  const result: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--profile" || argument === "-p") {
      index += 1;
      continue;
    }
    if (argument?.startsWith("--profile=")) continue;
    if (argument !== undefined) result.push(argument);
  }
  return [...result, "--profile", profile];
}

function lineBytes(program: string, args: readonly string[]): number {
  return Buffer.byteLength([program, ...args].join(" "), "utf8");
}

interface OverlayOwner {
  readonly interlock: "codex-overlay-owner@v0";
  readonly journal: string;
  readonly graph: string;
  readonly node: string;
  readonly session: string;
  readonly terminationConfirmed?: boolean;
}

function isWithin(path: string, root: string): boolean {
  const fromRoot = relative(resolve(root), resolve(path));
  return (
    fromRoot === "" ||
    (fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot))
  );
}

function stateHome(environment: Readonly<Record<string, string>>): string {
  const configured = environment["XDG_STATE_HOME"];
  if (configured !== undefined && configured.length > 0) return configured;
  const home = environment["HOME"];
  return join(home !== undefined && home.length > 0 ? home : homedir(), ".local", "state");
}

export function interlockStateDirectory(environment?: Readonly<Record<string, string>>): string {
  const resolvedEnvironment =
    environment ??
    Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    );
  return join(stateHome(resolvedEnvironment), "interlock");
}

function existingAncestor(path: string): string {
  let current = resolve(path);
  while (true) {
    try {
      lstatSync(current);
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) return current;
      current = parent;
    }
  }
}

function canonicalAncestor(path: string): string {
  return realpathSync(existingAncestor(path));
}

function processEnvironmentWithoutGit(): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (
      value !== undefined &&
      key !== "GIT_DIR" &&
      key !== "GIT_WORK_TREE" &&
      key !== "GIT_COMMON_DIR"
    ) {
      environment[key] = value;
    }
  }
  return environment;
}

function gitRoot(path: string): string | undefined {
  try {
    return execFileSyncOwned("git", ["rev-parse", "--show-toplevel"], {
      cwd: path,
      env: processEnvironmentWithoutGit(),
      encoding: "utf8",
    }).trim();
  } catch {
    return undefined;
  }
}

function gitWorktrees(path: string): readonly string[] {
  try {
    const output = execFileSyncOwned("git", ["worktree", "list", "--porcelain"], {
      cwd: path,
      env: processEnvironmentWithoutGit(),
      encoding: "utf8",
    });
    return output
      .split(/\r?\n/)
      .filter((line) => line.startsWith("worktree "))
      .map((line) => line.slice("worktree ".length))
      .filter((candidate) => candidate.length > 0);
  } catch {
    return [];
  }
}

function validateStateContainment(cwd: string, state: string): Result<void, string> {
  let canonicalState: string;
  try {
    canonicalState = canonicalAncestor(state);
  } catch (error) {
    return err(error instanceof Error ? error.message : "could not canonicalize Codex state path");
  }
  const canonicalCwd = canonicalAncestor(cwd);
  const launchRoot = gitRoot(canonicalCwd);
  const worktrees = gitWorktrees(canonicalCwd).flatMap((candidate) => {
    try {
      return [realpathSync(candidate)];
    } catch {
      return [];
    }
  });
  if (
    (launchRoot !== undefined && isWithin(canonicalState, realpathSync(launchRoot))) ||
    worktrees.some((worktree) => isWithin(canonicalState, worktree))
  ) {
    return err("the Codex state directory is inside the launch repository or one of its worktrees");
  }
  const otherRepository = gitRoot(canonicalState);
  if (otherRepository !== undefined) {
    return err("the Codex state directory is inside another repository");
  }
  return ok(undefined);
}

function ensureDirectory(path: string): void {
  try {
    const entry = lstatSync(path);
    if (entry.isSymbolicLink()) throw new Error(`${path} is a symbolic link`);
    if (!entry.isDirectory()) throw new Error(`${path} is not a directory`);
    return;
  } catch (error) {
    if (error instanceof Error && !("code" in error)) throw error;
  }
  mkdirSync(path, { mode: 0o700 });
  const created = lstatSync(path);
  if (!created.isDirectory() || created.isSymbolicLink())
    throw new Error(`${path} is not a directory`);
}

function removeTree(path: string): void {
  let entry: Stats;
  try {
    entry = lstatSync(path);
  } catch {
    return;
  }
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    unlinkSync(path);
    return;
  }
  for (const child of readdirSync(path)) removeTree(join(path, child));
  rmdirSync(path);
}

function ownerRecord(path: string): OverlayOwner | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const record: Record<string, unknown> = Object.fromEntries(Object.entries(parsed));
    if (
      record["interlock"] !== "codex-overlay-owner@v0" ||
      typeof record["journal"] !== "string" ||
      typeof record["graph"] !== "string" ||
      typeof record["node"] !== "string" ||
      typeof record["session"] !== "string"
    )
      return undefined;
    return {
      interlock: "codex-overlay-owner@v0",
      journal: record["journal"],
      graph: record["graph"],
      node: record["node"],
      session: record["session"],
      ...(record["terminationConfirmed"] === true ? { terminationConfirmed: true } : {}),
    };
  } catch {
    return undefined;
  }
}

function journalConfirmsTermination(owner: OverlayOwner): boolean {
  if (!owner.terminationConfirmed) return false;
  try {
    const lines = readFileSync(owner.journal, "utf8").split(/\r?\n/);
    let ownerSessionStartedAt: number | undefined;
    let latestSessionStartedAt: number | undefined;
    let terminalOutcomeAfterOwnerStart = false;
    for (const [index, line] of lines.entries()) {
      if (line.trim().length === 0) continue;
      const parsed: unknown = JSON.parse(line);
      if (typeof parsed !== "object" || parsed === null) continue;
      const record: Record<string, unknown> = Object.fromEntries(Object.entries(parsed));
      if (record["kind"] === "session-started") {
        const session = record["session"];
        if (typeof session !== "object" || session === null) continue;
        const sessionRecord: Record<string, unknown> = Object.fromEntries(Object.entries(session));
        const node = sessionRecord["node"];
        if (typeof node !== "object" || node === null) continue;
        const nodeRecord: Record<string, unknown> = Object.fromEntries(Object.entries(node));
        if (nodeRecord["graph"] !== owner.graph || nodeRecord["id"] !== owner.node) continue;
        latestSessionStartedAt = index;
        if (sessionRecord["id"] === owner.session) ownerSessionStartedAt = index;
        continue;
      }
      if (record["kind"] !== "outcome-set") continue;
      const node = record["node"];
      const outcome = record["outcome"];
      if (
        typeof node !== "object" ||
        node === null ||
        typeof outcome !== "object" ||
        outcome === null
      )
        continue;
      const nodeRecord: Record<string, unknown> = Object.fromEntries(Object.entries(node));
      const outcomeRecord: Record<string, unknown> = Object.fromEntries(Object.entries(outcome));
      if (
        nodeRecord["graph"] === owner.graph &&
        nodeRecord["id"] === owner.node &&
        (outcomeRecord["kind"] === "cleared" || outcomeRecord["kind"] === "failed") &&
        ownerSessionStartedAt !== undefined &&
        index > ownerSessionStartedAt
      ) {
        terminalOutcomeAfterOwnerStart = true;
      }
    }
    return (
      ownerSessionStartedAt !== undefined &&
      latestSessionStartedAt === ownerSessionStartedAt &&
      terminalOutcomeAfterOwnerStart
    );
  } catch {
    return false;
  }
}

function removeStaleOverlays(root: string, narrate?: (line: string) => void): void {
  let rootEntry: Stats;
  try {
    rootEntry = lstatSync(root);
  } catch {
    return;
  }
  if (rootEntry.isSymbolicLink() || !rootEntry.isDirectory()) return;
  for (const graph of readdirSync(root)) {
    const graphPath = join(root, graph);
    let graphEntry: Stats;
    try {
      graphEntry = lstatSync(graphPath);
    } catch {
      continue;
    }
    if (graphEntry.isSymbolicLink() || !graphEntry.isDirectory()) continue;
    for (const node of readdirSync(graphPath)) {
      const nodePath = join(graphPath, node);
      let nodeEntry: Stats;
      try {
        nodeEntry = lstatSync(nodePath);
      } catch {
        continue;
      }
      if (nodeEntry.isSymbolicLink() || !nodeEntry.isDirectory()) continue;
      for (const session of readdirSync(nodePath)) {
        const sessionPath = join(nodePath, session);
        let sessionEntry: Stats;
        try {
          sessionEntry = lstatSync(sessionPath);
        } catch {
          continue;
        }
        if (sessionEntry.isSymbolicLink() || !sessionEntry.isDirectory()) continue;
        const owner = ownerRecord(join(sessionPath, "owner.json"));
        if (owner !== undefined && journalConfirmsTermination(owner)) {
          removeTree(sessionPath);
          narrate?.(`removed confirmed Codex overlay ${sessionPath}`);
        }
      }
    }
  }
}

function safeSegment(value: string): boolean {
  return (
    value.length > 0 &&
    value !== "." &&
    value !== ".." &&
    !value.includes("/") &&
    !value.includes("\\")
  );
}

function createOverlay(
  cwd: string,
  snapshot: ConfigSnapshot,
  servers: readonly string[],
  environment: Readonly<Record<string, string>>,
  movedEnvironment: Readonly<Record<string, string>>,
  options: CodexLaunchOptions,
): Result<
  {
    readonly home: string;
    readonly profile: string;
    readonly cleanup: (terminationConfirmed: boolean) => void;
  },
  string
> {
  const graph = environment["INTERLOCK_GRAPH"] ?? "graph";
  const node = environment["INTERLOCK_NODE"] ?? "node";
  const session = environment["INTERLOCK_SESSION"] ?? "session";
  if (![graph, node, session].every(safeSegment))
    return err("Codex overlay identity contains an unsafe path segment");
  const state = interlockStateDirectory(environment);
  const containment = validateStateContainment(cwd, state);
  if (isErr(containment)) return containment;
  const root = join(state, "codex-homes");
  const home = join(root, graph, node, session);
  const journal = resolve(
    options.journalPath ??
      environment["INTERLOCK_JOURNAL"] ??
      join(cwd, ".interlock", "ledger", "journal.jsonl"),
  );
  try {
    ensureDirectory(stateHome(environment));
    ensureDirectory(state);
    ensureDirectory(root);
    removeStaleOverlays(root, options.narrate);
    ensureDirectory(join(root, graph));
    ensureDirectory(join(root, graph, node));
    try {
      if (lstatSync(home).isSymbolicLink()) return err("the Codex overlay path is a symbolic link");
      return err("the Codex overlay path already exists");
    } catch (error) {
      if (!(error instanceof Error) || "code" in error === false) throw error;
    }
    mkdirSync(home, { mode: 0o700 });
    const safeSession = session.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 24) || "session";
    const profile = `interlock-${safeSession}`;
    const generated = new Set(["config.toml", `${profile}.config.toml`, "owner.json"]);
    if (existsSync(configHome(environment))) {
      for (const entry of readdirSync(configHome(environment), { withFileTypes: true })) {
        if (generated.has(entry.name)) continue;
        symlinkSync(
          join(configHome(environment), entry.name),
          join(home, entry.name),
          entry.isDirectory() ? "dir" : "file",
        );
      }
    }
    writeFileSync(join(home, "config.toml"), snapshot.baseText, { mode: 0o600 });
    const sourceProfile = snapshot.profileText ?? "";
    const generatedProfile = [
      sourceProfile,
      sourceProfile.length > 0 && !sourceProfile.endsWith("\n") ? "" : undefined,
      markerLines(servers, environment),
      shellEnvironmentLines(movedEnvironment),
    ]
      .filter((line): line is string => line !== undefined && line.length > 0)
      .join("\n");
    writeFileSync(join(home, `${profile}.config.toml`), `${generatedProfile}\n`, { mode: 0o600 });
    writeFileSync(
      join(home, "owner.json"),
      `${JSON.stringify({ interlock: "codex-overlay-owner@v0", journal, graph, node, session })}\n`,
      { mode: 0o600 },
    );
    let cleaned = false;
    const cleanup = (terminationConfirmed: boolean): void => {
      if (cleaned) return;
      if (!terminationConfirmed) {
        options.narrate?.(`kept Codex overlay ${home}: session termination was not confirmed`);
        return;
      }
      try {
        writeFileSync(
          join(home, "owner.json"),
          `${JSON.stringify({ interlock: "codex-overlay-owner@v0", journal, graph, node, session, terminationConfirmed: true })}\n`,
          { mode: 0o600 },
        );
        removeTree(home);
        cleaned = true;
      } catch (error) {
        options.narrate?.(
          `kept Codex overlay ${home}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };
    return ok({
      home,
      profile,
      cleanup,
    });
  } catch (error) {
    return err(error instanceof Error ? error.message : "could not prepare Codex overlay");
  }
}

export function configuredCodexMcpServers(
  args: readonly string[],
  environment: Readonly<Record<string, string>>,
  cwd = process.cwd(),
): Result<readonly string[], string> {
  const snapshot = snapshotConfig(cwd, args, environment);
  if (isErr(snapshot)) return snapshot;
  return ok(
    [...snapshot.value.servers]
      .filter(([, config]) => config.command === true && config.url !== true)
      .map(([name]) => name),
  );
}

export function prepareCodexLaunch(
  args: readonly string[],
  cwd: string,
  environment: Readonly<Record<string, string>>,
  options: CodexLaunchOptions = {},
): Result<CodexPreparedLaunch, CodexLaunchRefusal> {
  const snapshot = snapshotConfig(cwd, args, environment);
  if (isErr(snapshot)) return refusal([], snapshot.error);
  const configured = [...snapshot.value.servers]
    .filter(([, config]) => config.command === true && config.url !== true)
    .map(([name]) => name);
  const conflicts = configured.flatMap((name) => {
    const values = snapshot.value.servers.get(name)?.markerValues;
    return values === undefined
      ? []
      : [...values].flatMap(([key, value]) =>
          environment[key] === undefined || environment[key] === value
            ? []
            : [`${name}.${key} is already ${JSON.stringify(value)}`],
        );
  });
  if (conflicts.length > 0) return refusal(configured, `marker conflict: ${conflicts.join(", ")}`);
  const listed = (
    options.listCodexMcp ??
    ((listCwd, listEnvironment) => discoverCodexMcpServers(listCwd, args, listEnvironment))
  )(cwd, environment);
  if (isErr(listed)) return refusal(configured, `codex mcp list --json failed: ${listed.error}`);
  const listedNames = new Set(listed.value);
  const missing = configured.filter((name) => !listedNames.has(name));
  if (missing.length > 0) {
    return refusal(
      missing,
      `configured stdio server(s) were not discovered: ${missing.join(", ")}`,
    );
  }
  const program = options.program ?? "codex";
  const argv = agentEnvironmentArgs("codex", args, environment, configured);
  if (lineBytes(program, argv) < CODEX_CANONICAL_LINE_LIMIT) {
    options.narrate?.(
      `codex marker delivery: argv (${String(configured.length)} configured stdio server(s))`,
    );
    return ok({
      kind: "delivered",
      path: "argv",
      args: argv,
      environment,
      servers: configured,
      cleanup: (_terminationConfirmed: boolean) => undefined,
    });
  }
  const profile = `interlock-${(environment["INTERLOCK_SESSION"] ?? "session").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 24) || "session"}`;
  const keptKeys = new Set<string>([
    ...snapshot.value.projectShellEnvironmentKeys,
    ...selectorShellEnvironmentKeys(args),
  ]);
  const movedEnvironment: Record<string, string> = {};
  for (const [key, value] of Object.entries(environment)) {
    if (!keptKeys.has(key)) movedEnvironment[key] = value;
  }
  const overlayArgs = replaceProfile(
    [...args, ...generatedShellEnvironmentArgs(environment, keptKeys)],
    profile,
  );
  if (lineBytes(program, overlayArgs) >= CODEX_CANONICAL_LINE_LIMIT) {
    return refusal(
      configured,
      `Codex launch line remains at or above ${String(CODEX_CANONICAL_LINE_LIMIT)} UTF-8 bytes`,
    );
  }
  const overlay = createOverlay(
    cwd,
    snapshot.value,
    configured,
    environment,
    movedEnvironment,
    options,
  );
  if (isErr(overlay))
    return refusal(configured, `Codex overlay could not be prepared: ${overlay.error}`);
  options.narrate?.("codex marker delivery: overlay");
  return ok({
    kind: "delivered",
    path: "overlay",
    args: overlayArgs,
    environment: { ...environment, CODEX_HOME: overlay.value.home },
    servers: configured,
    cleanup: overlay.value.cleanup,
  });
}

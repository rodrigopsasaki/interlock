import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import { parse } from "yaml";
import { isRecord, isStringArray, prop } from "./validate.ts";

export interface MachineProvider {
  readonly admit: readonly string[];
  readonly release: readonly string[];
  readonly env: readonly string[];
  readonly heavy: readonly string[];
}

export interface MachineAttempt {
  readonly provider: MachineProvider | "none";
  readonly env: Readonly<Record<string, string>>;
  readonly heavy: readonly string[];
}

export const NO_MACHINE_PROVIDER =
  "no machine provider is configured; write ~/.config/interlock/machine.yaml, or `provider: none` to run without one";

export function machinePath(): string {
  return (
    process.env["INTERLOCK_MACHINE"] ||
    join(process.env["XDG_CONFIG_HOME"] || join(homedir(), ".config"), "interlock", "machine.yaml")
  );
}

function argv(value: unknown): value is readonly string[] {
  return (
    isStringArray(value) &&
    value.length > 0 &&
    value.every((part) => !part.includes("\0")) &&
    value[0] !== ""
  );
}

export function parseMachine(value: unknown): Result<MachineProvider | "none", string> {
  if (!isRecord(value) || Array.isArray(value) || prop(value, "interlock") !== "machine@v0") {
    return err("machine.interlock must be machine@v0");
  }
  const provider = prop(value, "provider");
  if (provider === "none") return ok("none");
  if (!isRecord(provider) || Array.isArray(provider))
    return err("machine.provider must be a mapping or none");
  const admit = prop(provider, "admit");
  const release = prop(provider, "release");
  const env = prop(provider, "env");
  const heavy = prop(provider, "heavy");
  if (!argv(admit)) return err("machine.provider.admit must be a nonempty argv of strings");
  if (!argv(release)) return err("machine.provider.release must be a nonempty argv of strings");
  if (!argv(env)) return err("machine.provider.env must be a nonempty argv of strings");
  if (!argv(heavy)) return err("machine.provider.heavy must be a nonempty argv of strings");
  return ok({ admit, release, env, heavy });
}

export async function loadMachine(
  path = machinePath(),
): Promise<Result<MachineProvider | "none", string>> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    return err(
      isRecord(error) && prop(error, "code") === "ENOENT"
        ? NO_MACHINE_PROVIDER
        : `${path}: machine file cannot be read`,
    );
  }
  try {
    const value: unknown = parse(raw);
    const parsed = parseMachine(value);
    return isErr(parsed) ? err(`${path}: ${parsed.error}`) : parsed;
  } catch (error) {
    return err(
      `${path}: malformed machine.yaml: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export interface ProviderExit {
  readonly code: number;
  readonly output: string;
  readonly stdout: string;
}

export function runProviderCommand(
  command: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProviderExit> {
  return new Promise((resolve) => {
    const [bin, ...args] = command;
    if (bin === undefined) {
      resolve({ code: -1, output: "empty provider command", stdout: "" });
      return;
    }
    const child = spawn(bin, args, { cwd, env, timeout: 60_000 });
    let output = "";
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      output += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      output += error.message;
    });
    child.on("close", (code) => resolve({ code: code ?? -1, output, stdout }));
  });
}

export function stringEnvironment(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([key, item]) =>
        key.length > 0 && !/[=\0]/.test(key) && typeof item === "string" && !item.includes("\0"),
    )
  );
}

export async function resolveMachine(
  cwd: string,
  path = machinePath(),
): Promise<Result<MachineAttempt, string>> {
  const loaded = await loadMachine(path);
  if (isErr(loaded)) return loaded;
  if (loaded.value === "none") return ok({ provider: "none", env: {}, heavy: [] });
  const result = await runProviderCommand(loaded.value.env, cwd);
  if (result.code !== 0)
    return err(
      `machine.provider.env exited ${result.code}: ${result.output.split(/\r?\n/)[0] ?? ""}`,
    );
  let value: unknown;
  try {
    value = JSON.parse(result.stdout);
  } catch {
    return err("machine.provider.env must print a JSON object of string values");
  }
  if (!stringEnvironment(value))
    return err(
      "machine.provider.env must print a JSON object of string values (valid environment keys and values)",
    );
  return ok({ provider: loaded.value, env: value, heavy: loaded.value.heavy });
}

export function providerArgv(
  command: readonly string[],
  values: Readonly<Record<string, string>>,
): readonly string[] {
  return command.map((part) =>
    part.replace(
      /\{(holder|token|pid|pane|workspace|agent|worktree|attempt)\}/g,
      (match, name: string) => values[name] ?? match,
    ),
  );
}

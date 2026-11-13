import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import { parse } from "yaml";
import { runOwnedCommand } from "./ownedCommand.ts";
import { isRecord, isStringArray, prop } from "./validate.ts";

export interface MachineProvider {
  readonly admit: readonly string[];
  readonly bind?: readonly string[];
  readonly release: readonly string[];
  readonly env: readonly string[];
  readonly heavy: readonly string[];
  readonly cite?: readonly string[];
  readonly busy?: BusyPolicy;
}

export interface BusyPolicy {
  readonly exitCode: number;
  readonly attempts: number;
  readonly firstBackoffMs: number;
  readonly maxBackoffMs: number;
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
  if (!isRecord(value) || Array.isArray(value)) {
    return err("machine.interlock must be machine@v0 or machine@v1");
  }
  const version = prop(value, "interlock");
  if (version !== "machine@v0" && version !== "machine@v1") {
    return err("machine.interlock must be machine@v0 or machine@v1");
  }
  const provider = prop(value, "provider");
  if (provider === "none") return ok("none");
  if (!isRecord(provider) || Array.isArray(provider))
    return err("machine.provider must be a mapping or none");
  const admit = prop(provider, "admit");
  const bind = prop(provider, "bind");
  const release = prop(provider, "release");
  const env = prop(provider, "env");
  const heavy = prop(provider, "heavy");
  const cite = prop(provider, "cite");
  const busy = prop(provider, "busy");
  if (!argv(admit)) return err("machine.provider.admit must be a nonempty argv of strings");
  if (bind !== undefined && !argv(bind))
    return err("machine.provider.bind must be a nonempty argv of strings");
  if (!argv(release)) return err("machine.provider.release must be a nonempty argv of strings");
  if (!argv(env)) return err("machine.provider.env must be a nonempty argv of strings");
  if (!argv(heavy)) return err("machine.provider.heavy must be a nonempty argv of strings");
  if (cite !== undefined && !argv(cite))
    return err("machine.provider.cite must be a nonempty argv of strings");
  if (version === "machine@v0" || busy === undefined) {
    return ok({
      admit,
      release,
      env,
      heavy,
      ...(bind === undefined ? {} : { bind }),
      ...(cite === undefined ? {} : { cite }),
    });
  }
  const parsedBusy = parseBusy(busy);
  if (isErr(parsedBusy)) return parsedBusy;
  return ok({
    admit,
    release,
    env,
    heavy,
    ...(bind === undefined ? {} : { bind }),
    ...(cite === undefined ? {} : { cite }),
    busy: parsedBusy.value,
  });
}

function integerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum
  );
}

function parseBusy(value: unknown): Result<BusyPolicy, string> {
  if (!isRecord(value) || Array.isArray(value)) {
    return err("machine.provider.busy must be a mapping");
  }
  const exitCode = prop(value, "exit_code");
  const attempts = prop(value, "attempts");
  const firstBackoffMs = prop(value, "first_backoff_ms");
  const maxBackoffMs = prop(value, "max_backoff_ms");
  if (!integerInRange(exitCode, 64, 113)) {
    return err("machine.provider.busy.exit_code must be an integer from 64 to 113");
  }
  if (!integerInRange(attempts, 1, 10)) {
    return err("machine.provider.busy.attempts must be an integer from 1 to 10");
  }
  if (!integerInRange(firstBackoffMs, 1, 600_000)) {
    return err("machine.provider.busy.first_backoff_ms must be an integer from 1 to 600000");
  }
  if (!integerInRange(maxBackoffMs, 1, 600_000)) {
    return err("machine.provider.busy.max_backoff_ms must be an integer from 1 to 600000");
  }
  if (firstBackoffMs > maxBackoffMs) {
    return err(
      "machine.provider.busy.first_backoff_ms must be less than or equal to max_backoff_ms",
    );
  }
  return ok({ exitCode, attempts, firstBackoffMs, maxBackoffMs });
}

export function validateExecMachine(provider: MachineProvider): Result<void, string> {
  if (provider.bind === undefined) return err("exec phase requires machine.provider.bind");
  const impossible = provider.admit.find(
    (part) => part.includes("{pid}") || part.includes("{pane}"),
  );
  return impossible === undefined
    ? ok(undefined)
    : err(`exec phase cannot admit with ${impossible}; the value does not exist before spawn`);
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
  if (command.length === 0)
    return Promise.resolve({ code: -1, output: "empty provider command", stdout: "" });
  return runOwnedCommand(command, cwd, env).then((result) => {
    if (isErr(result)) return { code: -1, output: result.error, stdout: "" };
    return {
      code: result.value.code,
      output: `${result.value.stdout}${result.value.stderr}`,
      stdout: result.value.stdout,
    };
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
      /\{(holder|token|pid|pane|workspace|agent|worktree|attempt|kind|id|session|phase|pgid|birth|boot|outcome)\}/g,
      (match, name: string) => values[name] ?? match,
    ),
  );
}

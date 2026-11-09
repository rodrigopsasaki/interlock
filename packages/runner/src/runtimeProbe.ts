import { spawn } from "node:child_process";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import type { ProbeCheckResult } from "ledger";
import type { PreparedLaunch, ProbeCheck, ProbeExecutor, ProbeInvocation } from "./runtime.ts";
import type { ResolvedRuntime } from "./runtimeCatalogue.ts";
import { expandProbeExec } from "./writableRootArgs.ts";

export const PROBE_CHECKS: readonly ProbeCheck[] = [
  "shm",
  "loopback",
  "worktree-file",
  "git-metadata",
  "signed-commit",
];

export interface ProbeProcessResult {
  readonly code: number;
  readonly output: string;
}

export type ProbeProcessRunner = (invocation: ProbeInvocation) => Promise<ProbeProcessResult>;

export interface ProbeExecutionOptions {
  readonly runtime: ResolvedRuntime;
  readonly launch: PreparedLaunch;
  readonly processRunner?: ProbeProcessRunner;
  readonly adapter?: ProbeExecutor;
  readonly runnerSignedCommit?: () => Promise<Result<string | undefined, string>>;
}

function commandFor(check: ProbeCheck): string {
  return `interlock-probe-${check}`;
}

function defaultProcessRunner(invocation: ProbeInvocation): Promise<ProbeProcessResult> {
  return new Promise((resolve) => {
    const [program, ...args] = invocation.argv;
    if (program === undefined) {
      resolve({ code: -1, output: "probe executor produced an empty argv" });
      return;
    }
    const child = spawn(program, args, {
      cwd: invocation.cwd,
      env: { ...process.env, ...invocation.environment },
      shell: false,
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.on("error", (error) => resolve({ code: -1, output: error.message }));
    child.on("close", (code) => resolve({ code: code ?? -1, output }));
  });
}

function missingArgument(
  expected: readonly string[],
  actual: readonly string[],
): string | undefined {
  for (let index = 0; index < expected.length; index += 1) {
    const want = expected[index];
    const got = actual[index];
    if (want !== got) {
      return got === undefined
        ? `missing launch argument "${want ?? ""}"`
        : `differs at argument ${index}: expected "${want ?? ""}", got "${got}"`;
    }
  }
  return actual.length > expected.length
    ? `unexpected launch argument "${actual[expected.length] ?? ""}"`
    : undefined;
}

export function execProbeInvocation(
  runtime: ResolvedRuntime,
  launch: PreparedLaunch,
  check: ProbeCheck,
): Result<ProbeInvocation, string> {
  const template = runtime.exec;
  if (template === undefined) return err("profile has no exec probe executor");
  const declaredArgs = runtime.kind === "exec" ? runtime.args.slice(1) : runtime.args;
  const expectedProfile = [launch.program, ...declaredArgs];
  const actualProfile = [...template.before, ...template.after];
  if (actualProfile[0] !== launch.program) {
    return err(
      `exec probe differs in program: expected "${launch.program}", got "${actualProfile[0] ?? ""}"`,
    );
  }
  const difference = missingArgument(expectedProfile, actualProfile);
  if (difference !== undefined) return err(difference);
  const accessArgs = launch.args.slice(declaredArgs.length);
  return ok({
    argv: expandProbeExec(template, commandFor(check)).flatMap((part, index) =>
      index === template.before.length
        ? accessArgs.length === 0
          ? [part]
          : [...accessArgs, part]
        : [part],
    ),
    cwd: launch.cwd,
    environment: launch.environment,
  });
}

async function invocationFor(
  options: ProbeExecutionOptions,
  check: ProbeCheck,
): Promise<Result<ProbeInvocation, string>> {
  if (options.runtime.exec !== undefined) {
    return execProbeInvocation(options.runtime, options.launch, check);
  }
  if (options.adapter === undefined) {
    return err(`runtime adapter for kind "${options.runtime.kind}" has no probe executor`);
  }
  return options.adapter(options.launch, check);
}

function resultFor(check: ProbeCheck, process: ProbeProcessResult): ProbeCheckResult {
  return process.code === 0
    ? { check, state: "passed" }
    : { check, state: "refused", error: process.output || `probe command exited ${process.code}` };
}

export async function runProbeChecks(
  options: ProbeExecutionOptions,
): Promise<readonly ProbeCheckResult[]> {
  const processRunner = options.processRunner ?? defaultProcessRunner;
  const results: ProbeCheckResult[] = [];
  for (const check of PROBE_CHECKS) {
    if (check === "signed-commit" && options.runtime.commits === "runner") {
      if (options.runnerSignedCommit === undefined) {
        results.push({
          check,
          state: "unavailable",
          reason: "runner custody has no signing executor",
        });
      } else {
        const signed = await options.runnerSignedCommit();
        results.push(
          isErr(signed)
            ? { check, state: "refused", error: signed.error }
            : signed.value === undefined
              ? { check, state: "passed" }
              : { check, state: "passed", fingerprint: signed.value },
        );
      }
      continue;
    }
    const invocation = await invocationFor(options, check);
    if (isErr(invocation)) {
      results.push({ check, state: "unavailable", reason: invocation.error });
      continue;
    }
    results.push(resultFor(check, await processRunner(invocation.value)));
  }
  return results;
}

export function probePassed(results: readonly ProbeCheckResult[]): boolean {
  return results.every((result) => result.state === "passed");
}

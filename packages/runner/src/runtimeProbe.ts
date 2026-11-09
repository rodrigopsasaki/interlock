import { spawn } from "node:child_process";
import { delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import type { ProbeCheckResult } from "ledger";
import type {
  PreparedLaunch,
  ProbeCheck,
  ProbeExecutor,
  ProbeInvocation,
  ProbeProcessLifecycle,
} from "./runtime.ts";
import { execRuntimeArgv, type ResolvedRuntime } from "./runtimeCatalogue.ts";
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

export type ProbeProcessRunner = (
  invocation: ProbeInvocation,
  lifecycle?: ProbeProcessLifecycle,
) => Promise<ProbeProcessResult>;

export interface ProbeExecutionOptions {
  readonly runtime: ResolvedRuntime;
  readonly launch: PreparedLaunch;
  readonly processRunner?: ProbeProcessRunner;
  readonly processLifecycleFor?: (
    check: ProbeCheck,
  ) => Promise<Result<ProbeProcessLifecycle | undefined, string>>;
  readonly adapter?: ProbeExecutor;
  readonly runnerSignedCommit?: () => Promise<Result<string | undefined, string>>;
}

function commandFor(check: ProbeCheck): string {
  return `interlock-probe-${check}`;
}

function probeBinDirectory(): string {
  return fileURLToPath(new URL("./probe-bin/", import.meta.url));
}

function effectiveProbeEnvironment(
  runtime: ResolvedRuntime,
  launch: PreparedLaunch,
): Readonly<Record<string, string>> {
  const environment = { ...launch.environment };
  for (const name of runtime.environmentPassthrough ?? []) {
    if (environment[name] === undefined && process.env[name] !== undefined) {
      environment[name] = process.env[name];
    }
  }
  return environment;
}

function defaultProcessRunner(
  invocation: ProbeInvocation,
  lifecycle?: ProbeProcessLifecycle,
): Promise<ProbeProcessResult> {
  return new Promise((resolve) => {
    const [program, ...args] = invocation.argv;
    if (program === undefined) {
      resolve({ code: -1, output: "probe executor produced an empty argv" });
      return;
    }
    const inheritedPath = invocation.environment["PATH"] ?? process.env["PATH"] ?? "";
    const child = spawn(program, args, {
      cwd: invocation.cwd,
      env: {
        ...process.env,
        ...invocation.environment,
        PATH: [probeBinDirectory(), inheritedPath]
          .filter((part) => part.length > 0)
          .join(delimiter),
      },
      detached: true,
      shell: false,
    });
    let output = "";
    let identityBound = false;
    let released = false;
    let releaseFailed = false;
    let binding: Promise<Result<void, string>> | undefined;
    const release = async (
      outcome: "never-started" | "group-empty" | "override",
      pgid: string,
    ): Promise<void> => {
      if (lifecycle === undefined || released) return;
      released = true;
      const releasedResult = await lifecycle.release(outcome, pgid);
      if (isErr(releasedResult)) {
        releaseFailed = true;
        output += `\n${releasedResult.error}`;
      }
    };
    const finish = (value: ProbeProcessResult): void => {
      resolve(value);
    };
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.on("spawn", () => {
      if (lifecycle === undefined || child.pid === undefined) {
        identityBound = true;
        return;
      }
      binding = lifecycle
        .bind({
          pid: child.pid,
          pgid: child.pid,
          birth: `${child.pid}-${Date.now()}`,
          boot: `${process.platform}-${process.ppid}`,
        })
        .then((bound) => {
          if (isErr(bound)) {
            child.kill("SIGTERM");
            output += `\n${bound.error}`;
            return bound;
          }
          identityBound = true;
          return bound;
        });
    });
    child.on("error", (error) => {
      void (binding ?? Promise.resolve(ok(undefined)))
        .then(() => release("never-started", child.pid === undefined ? "" : String(child.pid)))
        .then(() => finish({ code: -1, output: error.message }));
    });
    child.on("close", (code) => {
      void (binding ?? Promise.resolve(ok(undefined)))
        .then(() =>
          release(
            identityBound ? "group-empty" : "never-started",
            child.pid === undefined ? "" : String(child.pid),
          ),
        )
        .then(() => finish({ code: releaseFailed ? -1 : (code ?? -1), output }));
    });
  });
}

function expectedExecArguments(
  runtime: ResolvedRuntime,
  launch: PreparedLaunch,
  command: string,
): readonly string[] | undefined {
  if (runtime.kind !== "exec") return undefined;
  const headless = runtime.headlessArgs;
  if (headless === undefined) return undefined;
  const environment = effectiveProbeEnvironment(runtime, launch);
  const expected = execRuntimeArgv(runtime, command, false, {
    environment,
  });
  const preparedPrompt = execRuntimeArgv(runtime, "{prompt}", false, {
    environment,
  });
  const promptIndex = preparedPrompt.indexOf("{prompt}");
  const expansion = launch.args.length + 1 - preparedPrompt.length;
  const prepared = [launch.program, ...launch.args];
  const expandedPromptIndex = promptIndex + expansion;
  if (
    promptIndex < 1 ||
    expandedPromptIndex >= prepared.length ||
    prepared[expandedPromptIndex] !== "{prompt}"
  ) {
    return undefined;
  }
  return expected;
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
  const expectedHeadless = expectedExecArguments(runtime, launch, commandFor(check));
  if (runtime.kind === "exec" && runtime.headlessArgs === undefined) {
    return err("exec profile has no headless_args; probe access split is undeclared");
  }
  if (runtime.kind === "exec" && expectedHeadless === undefined) {
    return err("exec profile headless_args does not identify one whole {prompt} argument");
  }
  if (expectedHeadless !== undefined) {
    const actual = expandProbeExec(template, commandFor(check));
    const difference = missingArgument(expectedHeadless, actual);
    if (difference !== undefined) return err(difference);
    const prepared = [launch.program, ...launch.args];
    const environment = effectiveProbeEnvironment(runtime, launch);
    const preparedPrompt = execRuntimeArgv(runtime, "{prompt}", false, { environment });
    const promptIndex = preparedPrompt.indexOf("{prompt}");
    const expansion = prepared.length - preparedPrompt.length;
    const expandedPromptIndex = promptIndex + expansion;
    return ok({
      argv: prepared.map((part, index) =>
        index === expandedPromptIndex ? commandFor(check) : part,
      ),
      cwd: launch.cwd,
      environment,
    });
  }
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
    const lifecycle =
      options.processLifecycleFor === undefined
        ? ok(undefined)
        : await options.processLifecycleFor(check);
    if (isErr(lifecycle)) {
      results.push({ check, state: "unavailable", reason: lifecycle.error });
      continue;
    }
    let processResult: ProbeProcessResult;
    try {
      processResult = await processRunner(invocation.value, lifecycle.value);
    } catch (error) {
      if (lifecycle.value !== undefined) {
        await lifecycle.value.release("override", "");
      }
      results.push({
        check,
        state: "refused",
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    results.push(resultFor(check, processResult));
  }
  return results;
}

export function probePassed(results: readonly ProbeCheckResult[]): boolean {
  return results.every((result) => result.state === "passed");
}

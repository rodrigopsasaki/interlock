import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createSystemClock } from "@phyxiusjs/clock";
import { isErr, ok, type Result } from "@phyxiusjs/fp";
import {
  clearedHeadOf,
  explainGraphRefusal,
  findRepoRoot,
  type GraphDocument,
  graphFilePath,
  loadGraphDocumentText,
  sharedJournalDirectory,
} from "face";
import { createLedger, type LedgerProjection, nodeKey, type Outcome } from "ledger";
import {
  createFixtureEnvironment,
  ensureNodeWorktree,
  execFileSyncOwned,
  explainLocalConfigRefusal,
  explainMergeMainRefusal,
  explainWorktreeRefusal,
  explainWorktreeSetupRefusal,
  type FixtureEnvironment,
  type GateCommandResult,
  gateCommandTable,
  loadLocalConfig,
  loadStandingGates,
  mergeMainIntoWorktree,
  removeWorktree,
  resolveMachine,
  runOwnedCommandWithTimeout,
  runSetupCommand,
  type StandingGate,
  substituteGateCommand,
} from "runner";
import { parseFlagValue } from "./flags.ts";
import type { CommandResult } from "./main.ts";

const DEFAULT_TEST_WORKERS = 4;
const DEFAULT_HEAP_MB = 4096;
const LAND_COMMAND_TIMEOUT_MS = 60 * 60 * 1000;

interface Suite {
  readonly name: string;
  readonly command: string;
  readonly expectOutput?: RegExp;
}

interface LandMachine {
  readonly env: NodeJS.ProcessEnv;
  readonly heavy: readonly string[];
}

export interface LandOptions {
  readonly cwd?: string;
  readonly machine?: LandMachine;
  readonly fixture?: FixtureEnvironment;
  readonly mergeMain?: typeof mergeMainIntoWorktree;
  readonly commandRunner?: (
    argv: readonly string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
  ) => Promise<GateCommandResult>;
  readonly install?: (
    worktree: string,
    env: NodeJS.ProcessEnv,
    heavy: readonly string[],
  ) => Promise<Result<void, string>>;
  readonly narrate?: (line: string) => void;
}

function parsePositiveInteger(
  args: readonly string[],
  flag: string,
  fallback: number,
): Result<number, string> {
  const parsed = parseFlagValue(args, flag);
  if (parsed.kind === "absent") return ok(fallback);
  if (parsed.kind === "invalid") return { _tag: "Err", error: `${flag} requires a value` };
  if (!/^[1-9][0-9]*$/.test(parsed.value)) {
    return { _tag: "Err", error: `${flag} must be a positive integer` };
  }
  const value = Number.parseInt(parsed.value, 10);
  return Number.isSafeInteger(value) ? ok(value) : { _tag: "Err", error: `${flag} is too large` };
}

function gitOutput(cwd: string, args: readonly string[]): Result<string, string> {
  try {
    return ok(execFileSyncOwned("git", args, { cwd, encoding: "utf-8" }).trim());
  } catch (error) {
    return {
      _tag: "Err",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function commandFailure(result: GateCommandResult): string {
  const output = result.output.trim();
  return output.length === 0 ? `exited ${result.exitCode}` : `exited ${result.exitCode}: ${output}`;
}

function suitesFor(
  graph: GraphDocument,
  standing: readonly StandingGate[],
): Result<readonly Suite[], string> {
  const suites: Suite[] = [];
  for (const node of graph.nodes) {
    const commands = gateCommandTable(standing, node.gates);
    for (const declared of [...standing, ...node.gates]) {
      const command = commands.get(declared.id);
      if (command === undefined || command.kind === "human") continue;
      if (command.run === undefined || command.run.trim() === "") {
        return { _tag: "Err", error: `${node.id}:${declared.id} has no command` };
      }
      const substituted = substituteGateCommand(command.run, { graph: graph.id, id: node.id });
      if (isErr(substituted)) {
        return {
          _tag: "Err",
          error: `${node.id}:${declared.id}: unknown placeholder {${substituted.error.token}}`,
        };
      }
      suites.push({
        name: `${node.id}:${declared.id}`,
        command: substituted.value,
        ...(command.expectOutput === undefined ? {} : { expectOutput: command.expectOutput }),
      });
    }
  }
  suites.push(
    { name: "repository tests", command: "pnpm test" },
    { name: "repository lint", command: "pnpm lint" },
    { name: "repository typecheck", command: "pnpm typecheck" },
  );
  return ok(suites);
}

function clearedHead(
  graph: string,
  node: string,
  outcome: Outcome | undefined,
  projection: LedgerProjection,
): Result<string, string> {
  if (outcome?.kind !== "cleared") return { _tag: "Err", error: `${node}: node is not cleared` };
  const session = [...projection.sessions.values()].find(
    (candidate) =>
      candidate.node.graph === graph &&
      candidate.node.id === node &&
      candidate.leaseGeneration ===
        projection.nodes.get(nodeKey({ graph, id: node }))?.outcomeSetAtGeneration,
  );
  const head = clearedHeadOf(outcome, session?.graphBaseSha);
  return head.kind === "known"
    ? ok(head.head)
    : { _tag: "Err", error: `${node}: ${head.because}; refusing to land` };
}

function signatureStatus(repoRoot: string, mainRef: string | undefined): Result<string, string> {
  if (mainRef === undefined) return { _tag: "Err", error: "land has no main branch ref" };
  const commits = gitOutput(repoRoot, ["log", "--format=%H%x00%G?", `${mainRef}..HEAD`]);
  if (isErr(commits)) return commits;
  const records = commits.value.split("\0").filter((record) => record.length > 0);
  const statuses = new Set<string>();
  for (let index = 1; index < records.length; index += 2) {
    const status = records[index];
    if (status !== undefined) statuses.add(status);
  }
  if (statuses.size === 0) return ok("G");
  const invalid = [...statuses].filter((status) => status !== "G");
  return invalid.length === 0
    ? ok("G")
    : {
        _tag: "Err",
        error: `land contains unsigned or unknown-key commit(s): ${invalid.join(", ")}`,
      };
}

function landWorktreePath(
  repoRoot: string,
  worktreeRoot: string,
  graph: string,
  node: string,
): string {
  return join(repoRoot, worktreeRoot, "land", graph, node);
}

function branchName(graph: string, node: string): string {
  return `land/${graph}/${node}`;
}

export async function runLandingSuites(
  suites: readonly Suite[],
  worktree: string,
  fixture: FixtureEnvironment,
  machine: LandMachine,
  knownFailures: readonly string[],
  commandRunner: NonNullable<LandOptions["commandRunner"]>,
  narrate: (line: string) => void,
): Promise<Result<void, string>> {
  for (const known of knownFailures) narrate(`known environment failure: ${known}`);
  for (const suite of suites) {
    const result = await commandRunner(
      [...machine.heavy, "mise", "exec", "--", ...suite.command.split(/\s+/)],
      worktree,
      { ...machine.env, ...fixture.env },
    );
    const namedFailures = knownFailures.filter((failure) => result.output.includes(failure));
    const outputMismatch =
      suite.expectOutput !== undefined && !suite.expectOutput.test(result.output);
    if (result.exitCode === 0 && !outputMismatch) {
      narrate(`suite ${suite.name}: passed`);
      continue;
    }
    if (namedFailures.length > 0) {
      narrate(`suite ${suite.name}: known environment failure (${namedFailures.join(", ")})`);
      continue;
    }
    const reason = outputMismatch
      ? "output did not match its declared expectation"
      : commandFailure(result);
    return { _tag: "Err", error: `suite ${suite.name} failed: ${reason}` };
  }
  return ok(undefined);
}

function defaultCommandRunner(
  argv: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<GateCommandResult> {
  return runOwnedCommandWithTimeout(argv, cwd, env, LAND_COMMAND_TIMEOUT_MS).then((result) => ({
    exitCode: result.code,
    output: result.output.toString("utf8"),
    stdout: result.stdout,
    stderr: result.stderr,
    ...(result.timedOut ? { timedOut: true } : {}),
  }));
}

export async function runInterlockLand(
  args: readonly string[],
  options: LandOptions = {},
): Promise<CommandResult> {
  const [graph, node] = args;
  if (graph === undefined || node === undefined) {
    return { exitCode: 1, message: "interlock land: expected a graph id and node id." };
  }
  const workers = parsePositiveInteger(args, "--test-workers", DEFAULT_TEST_WORKERS);
  if (isErr(workers)) return { exitCode: 1, message: `interlock land: ${workers.error}.` };
  const heap = parsePositiveInteger(args, "--heap-mb", DEFAULT_HEAP_MB);
  if (isErr(heap)) return { exitCode: 1, message: `interlock land: ${heap.error}.` };

  const narrate = options.narrate ?? ((line: string) => process.stdout.write(`${line}\n`));
  const cwd = options.cwd ?? process.cwd();
  const repoRoot = findRepoRoot(cwd);
  if (repoRoot === undefined) {
    return {
      exitCode: 1,
      message: `${cwd}: no .interlock directory found in this directory or any parent; expected to run inside an interlock repository.`,
    };
  }
  const graphPath = graphFilePath(repoRoot, graph);
  let graphBytes: Buffer;
  try {
    graphBytes = await readFile(graphPath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { exitCode: 1, message: `${graphPath}: no such file; expected a graph@v0 document.` };
    }
    throw error;
  }
  const document = loadGraphDocumentText(graphBytes.toString("utf8"), graphPath);
  if (isErr(document)) return { exitCode: 1, message: explainGraphRefusal(document.error) };

  const localConfig = await loadLocalConfig(repoRoot);
  if (isErr(localConfig))
    return { exitCode: 1, message: explainLocalConfigRefusal(localConfig.error) };
  const standing = await loadStandingGates(repoRoot);
  if (isErr(standing))
    return { exitCode: 1, message: `land: ${standing.error.kind} ${standing.error.path}` };
  const suites = suitesFor(document.value, standing.value);
  if (isErr(suites)) return { exitCode: 1, message: `land: ${suites.error}` };

  const journal = await sharedJournalDirectory(repoRoot);
  const ledger = await createLedger({ clock: createSystemClock(), directory: journal });
  if (isErr(ledger)) return { exitCode: 1, message: `${journal}: could not read the ledger.` };
  try {
    const projection = ledger.value.projection();
    const nodeView = projection.nodes.get(nodeKey({ graph, id: node }));
    const head = clearedHead(graph, node, nodeView?.outcome, projection);
    if (isErr(head)) return { exitCode: 1, message: `interlock land: ${head.error}.` };

    const machineResult =
      options.machine === undefined ? await resolveMachine(repoRoot) : ok(options.machine);
    if (isErr(machineResult)) return { exitCode: 1, message: machineResult.error };
    const machine: LandMachine = machineResult.value;
    const fixture =
      options.fixture ??
      createFixtureEnvironment({
        testWorkers: workers.value,
        heapMb: heap.value,
        baseEnv: { ...process.env, ...machine.env },
      });
    const landingFixture: FixtureEnvironment = {
      ...fixture,
      env: {
        ...fixture.env,
        ["VITEST_MAX_WORKERS"]: String(workers.value),
        ["VITEST_MAX_THREADS"]: String(workers.value),
        ["VITEST_MAX_FORKS"]: String(workers.value),
        ["NODE_OPTIONS"]: `--max-old-space-size=${heap.value}`,
      },
    };
    const path = landWorktreePath(repoRoot, localConfig.value.worktreeRoot, graph, node);
    const branch = branchName(graph, node);
    mkdirSync(path, { recursive: true });
    const created = ensureNodeWorktree(repoRoot, path, head.value, branch);
    if (isErr(created)) {
      if (options.fixture === undefined) fixture.cleanup();
      return { exitCode: 1, message: `interlock land: ${explainWorktreeRefusal(created.error)}.` };
    }
    try {
      narrate(`land branch: ${branch}`);
      let installedByMerge = false;
      const install =
        options.install ??
        (async (
          installWorktree: string,
          installEnv: NodeJS.ProcessEnv,
          heavy: readonly string[],
        ) => {
          const result = await runSetupCommand(
            "pnpm install --frozen-lockfile",
            installWorktree,
            installEnv,
            heavy,
          );
          return isErr(result)
            ? { _tag: "Err", error: explainWorktreeSetupRefusal(result.error) }
            : ok(undefined);
        });
      const mergeInstall = async (
        installWorktree: string,
        installEnv: NodeJS.ProcessEnv,
        heavy: readonly string[],
      ): Promise<Result<void, string>> => {
        installedByMerge = true;
        return install(installWorktree, installEnv, heavy);
      };
      const merge = await (options.mergeMain ?? mergeMainIntoWorktree)({
        worktree: path,
        node,
        env: landingFixture.env,
        heavy: machine.heavy,
        install: mergeInstall,
      });
      if (isErr(merge))
        return { exitCode: 1, message: `interlock land: ${explainMergeMainRefusal(merge.error)}.` };
      const mergeOutcome = merge.value;
      const commandRunner = options.commandRunner ?? defaultCommandRunner;
      if (!installedByMerge) {
        const installed = await install(path, landingFixture.env, machine.heavy);
        if (isErr(installed))
          return {
            exitCode: 1,
            message: `interlock land: frozen install refused: ${installed.error}.`,
          };
        narrate("frozen install passed");
      }
      const suitesResult = await runLandingSuites(
        suites.value,
        path,
        landingFixture,
        machine,
        document.value.knownEnvironmentFailures ?? [],
        commandRunner,
        narrate,
      );
      if (isErr(suitesResult))
        return { exitCode: 1, message: `interlock land: ${suitesResult.error}.` };

      const fullSha = gitOutput(path, ["rev-parse", "HEAD"]);
      if (isErr(fullSha)) return { exitCode: 1, message: `interlock land: ${fullSha.error}.` };
      const signatures = signatureStatus(path, mergeOutcome.mainRef);
      if (isErr(signatures))
        return { exitCode: 1, message: `interlock land: ${signatures.error}.` };
      const message = `${branch}: ${fullSha.value} (signatures: ${signatures.value})`;
      narrate(message);
      return { exitCode: 0, message };
    } finally {
      removeWorktree(repoRoot, path);
      if (options.fixture === undefined) fixture.cleanup();
    }
  } finally {
    await ledger.value.close();
  }
}

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../..");
const packagesRoot = resolve(repoRoot, "packages");
const reportsRoot = resolve(repoRoot, "packages/runner/test/.runs", `slow-tests-${Date.now()}`);
const thresholdMs = 1_500;

interface SlowDeclaration {
  readonly budgetMs: number;
  readonly reason: string;
}

interface ExpectedTest {
  readonly path: string;
  readonly fullName: string;
  readonly declaration: SlowDeclaration;
}

const expected: readonly ExpectedTest[] = [
  {
    path: "packages/cli/test/face/landedCache.test.ts",
    fullName:
      "landed cache: world refreshes through the face lifecycle reads main once per refresh, judges only what moved, retries a failed key and never reads for a screen-only redraw",
    declaration: {
      budgetMs: 10_000,
      reason: "integrates the Git-backed face lifecycle fixture with refresh and cache retries",
    },
  },
  {
    path: "packages/runner/test/realCodexMarkerOverflow.test.ts",
    fullName:
      "real Codex marker overflow delivery records marker values in real MCP children started by Codex exec",
    declaration: {
      budgetMs: 45_000,
      reason: "integrates real Codex exec with fixture MCP child processes and bounded cleanup",
    },
  },
  {
    path: "packages/runner/test/lineFitsRealCodex.test.ts",
    fullName:
      "real Codex line fitting runs a provider shell call with moved policy and marker values",
    declaration: {
      budgetMs: 45_000,
      reason: "integrates a loopback provider, real Codex shell call and fixture MCP child",
    },
  },
  {
    path: "packages/runner/test/worktreeMaintenance.test.ts",
    fullName:
      "the runner's worktrees against Git's default auto-maintenance writes the detached tasks only into the common object store, never into a node or backfill worktree or admin directory",
    declaration: {
      budgetMs: 10_000,
      reason: "integrates Git maintenance, linked worktrees and detached task cleanup",
    },
  },
  {
    path: "packages/runner/test/runnerCommits.test.ts",
    fullName:
      "commits entries in order, signs and adds both attempt trailers and authorship, then falls back",
    declaration: {
      budgetMs: 10_000,
      reason: "integrates real signed Git commits, trailers and fallback custody",
    },
  },
  {
    path: "packages/runner/test/submoduleReceipts.test.ts",
    fullName: "a scope that holds a gitlink is judged into a receipt without throwing",
    declaration: {
      budgetMs: 10_000,
      reason: "integrates a Git index containing a submodule gitlink with gate judging",
    },
  },
  {
    path: "packages/substrate/test/absorb.test.ts",
    fullName:
      "absorb degrades to a narrated refusal instead of acknowledged, judgement still able to complete, when the address stops answering mid-run",
    declaration: {
      budgetMs: 10_000,
      reason: "integrates an HTTP substrate that stops answering during absorb",
    },
  },
  {
    path: "packages/cli/test/run.test.ts",
    fullName:
      "interlock run sends a concise prompt projection after committing a complete 3000-path canonical brief",
    declaration: {
      budgetMs: 20_000,
      reason:
        "integrates a 3000-path Git commit, canonical brief projection and real session drive",
    },
  },
  {
    path: "packages/cli/test/face/landedCache.test.ts",
    fullName:
      "landed cache: across processes, on disk serves a judgment made by another process without a per-node read",
    declaration: {
      budgetMs: 10_000,
      reason: "integrates a separate position process with the on-disk landed cache",
    },
  },
  {
    path: "packages/cli/test/resumeRange.test.ts",
    fullName: "resumed debrief ranges keeps the predecessor code and writes the runner provenance",
    declaration: {
      budgetMs: 15_000,
      reason: "integrates Git ancestry, historical session bytes and runner provenance trailers",
    },
  },
  {
    path: "packages/cli/test/resumeRange.test.ts",
    fullName:
      "resumed debrief ranges carries the first start through a chain while both attempts stay open",
    declaration: {
      budgetMs: 15_000,
      reason: "integrates chained Git session ancestry and historical runner provenance bytes",
    },
  },
  {
    path: "packages/cli/test/judge.test.ts",
    fullName: "interlock judge binds an enabled origin through judge's actual absorb client",
    declaration: {
      budgetMs: 15_000,
      reason: "integrates CLI judge, real worktree absorption and an enabled substrate origin",
    },
  },
  {
    path: "packages/cli/test/debrief/recoverSessionStart.test.ts",
    fullName:
      "recover session start refuses later arbitrary commits, committed brief edits, and missing or duplicate starts",
    declaration: {
      budgetMs: 10_000,
      reason: "integrates Git history, committed brief bytes and ledger start recovery",
    },
  },
  {
    path: "packages/cli/test/execWithoutHerdr.test.ts",
    fullName: "runs both exec phases without herdr and gives each phase its own argv prompt",
    declaration: {
      budgetMs: 15_000,
      reason: "integrates both real exec phases, child argv prompts and session completion",
    },
  },
  {
    path: "packages/cli/test/execWithoutHerdr.test.ts",
    fullName: "runs both exec phases with their own stdin prompt",
    declaration: {
      budgetMs: 15_000,
      reason: "integrates both real exec phases, child stdin prompts and session completion",
    },
  },
  {
    path: "packages/cli/test/execWithoutHerdr.test.ts",
    fullName: "keeps a pending pane intent unresolved while exec runs without herdr",
    declaration: {
      budgetMs: 15_000,
      reason: "integrates exec phases with a retained pending pane outbox intent",
    },
  },
  {
    path: "packages/cli/test/execWithoutHerdr.test.ts",
    fullName: "lists a running exec session after the sessions synchronization barrier",
    declaration: {
      budgetMs: 20_000,
      reason:
        "integrates a blocked child process, synchronization barrier and live session listing",
    },
  },
  {
    path: "packages/cli/test/execWithoutHerdr.test.ts",
    fullName: "judges a held unleased exec session with --session",
    declaration: {
      budgetMs: 15_000,
      reason: "integrates exec completion, held ledger state and explicit session judging",
    },
  },
  {
    path: "packages/face/test/noSyncGit.test.ts",
    fullName:
      "no blocking git on the read path runs a two-repository position read with no synchronous child and at most the shared bound of git children",
    declaration: {
      budgetMs: 10_000,
      reason: "integrates two repository position reads with bounded asynchronous Git children",
    },
  },
  {
    path: "packages/cli/test/evidence.test.ts",
    fullName:
      "interlock evidence reads the corrected handoff from replay after supported revision and rejudge",
    declaration: {
      budgetMs: 10_000,
      reason: "integrates replayed ledger revisions, corrected handoff bytes and rejudging",
    },
  },
];

interface AssertionResult {
  readonly ancestorTitles?: readonly string[];
  readonly fullName?: string;
  readonly duration?: number;
  readonly status?: string;
  readonly meta?: Record<string, unknown>;
}

interface Report {
  readonly testResults?: readonly {
    readonly name?: string;
    readonly assertionResults?: readonly AssertionResult[];
  }[];
  readonly numPendingTests?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reportOf(value: unknown): Report | undefined {
  if (!isRecord(value)) return undefined;
  const testResults = value["testResults"];
  if (!Array.isArray(testResults)) return undefined;
  return {
    numPendingTests:
      typeof value["numPendingTests"] === "number" ? value["numPendingTests"] : undefined,
    testResults: testResults.filter(isRecord).map((file) => {
      const assertions = file["assertionResults"];
      return {
        name: typeof file["name"] === "string" ? file["name"] : undefined,
        assertionResults: (Array.isArray(assertions) ? assertions : [])
          .filter(isRecord)
          .map((assertion) => ({
            ancestorTitles: Array.isArray(assertion["ancestorTitles"])
              ? assertion["ancestorTitles"].filter(
                  (title): title is string => typeof title === "string",
                )
              : undefined,
            fullName: typeof assertion["fullName"] === "string" ? assertion["fullName"] : undefined,
            duration: typeof assertion["duration"] === "number" ? assertion["duration"] : undefined,
            status: typeof assertion["status"] === "string" ? assertion["status"] : undefined,
            meta: isRecord(assertion["meta"]) ? assertion["meta"] : undefined,
          })),
      };
    }),
  };
}

function declarationOf(assertion: AssertionResult): SlowDeclaration | undefined {
  const value = assertion.meta?.["interlockSlowIntegration"];
  if (!isRecord(value)) return undefined;
  const budgetMs = value["budgetMs"];
  const reason = value["reason"];
  return typeof budgetMs === "number" && typeof reason === "string"
    ? { budgetMs, reason }
    : undefined;
}

function fail(messages: readonly string[]): never {
  for (const message of messages) console.error(message);
  process.exit(1);
}

const packages = readdirSync(packagesRoot, { withFileTypes: true })
  .filter(
    (entry) => entry.isDirectory() && existsSync(resolve(packagesRoot, entry.name, "package.json")),
  )
  .map((entry) => entry.name)
  .sort();
const failures: string[] = [];
const declarations = new Map<string, SlowDeclaration>();
let logicUnderThreshold = 0;
mkdirSync(reportsRoot, { recursive: true });

for (const packageName of packages) {
  const reportPath = resolve(reportsRoot, `${packageName}.json`);
  const outputPath = resolve(reportsRoot, `${packageName}.output.txt`);
  const result = spawnSync(
    "pnpm",
    [
      "--filter",
      packageName,
      "exec",
      "vitest",
      "run",
      "--maxWorkers=1",
      "--minWorkers=1",
      "--reporter=json",
      `--outputFile=${reportPath}`,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  writeFileSync(outputPath, `${result.stdout ?? ""}${result.stderr ?? ""}`);
  writeFileSync(resolve(reportsRoot, `${packageName}.workers.txt`), "maxWorkers=1\nminWorkers=1\n");
  if (result.error !== undefined || result.status !== 0)
    failures.push(`${packageName}: Vitest failed; see ${relative(repoRoot, outputPath)}`);
  if (!existsSync(reportPath) || statSync(reportPath).size === 0) {
    failures.push(`${packageName}: JSON report is missing or empty`);
    continue;
  }
  let report: Report;
  try {
    const parsed: unknown = JSON.parse(readFileSync(reportPath, "utf8"));
    const normalized = reportOf(parsed);
    if (normalized === undefined) throw new Error("report shape");
    report = normalized;
  } catch {
    failures.push(`${packageName}: JSON report is invalid`);
    continue;
  }
  if (report.testResults === undefined || report.testResults.length === 0)
    failures.push(`${packageName}: JSON report has no test results`);
  if ((report.numPendingTests ?? 0) > 0) failures.push(`${packageName}: skipped tests are present`);
  for (const file of report.testResults ?? []) {
    const testPath = file.name === undefined ? "unknown" : relative(repoRoot, file.name);
    for (const assertion of file.assertionResults ?? []) {
      if (assertion.status !== "passed")
        failures.push(
          `${testPath}: ${assertion.fullName ?? "unknown test"} has status ${assertion.status ?? "unknown"}`,
        );
      const key = `${testPath}\n${assertion.fullName ?? ""}`;
      const declaration = declarationOf(assertion);
      if (declaration !== undefined) declarations.set(key, declaration);
      const duration = assertion.duration ?? 0;
      if (duration >= thresholdMs && declaration === undefined)
        failures.push(
          `${testPath}: ${assertion.fullName ?? "unknown test"} took ${duration.toFixed(1)}ms without a slow integration declaration`,
        );
      if (declaration === undefined && duration < thresholdMs) logicUnderThreshold += 1;
      if (declaration !== undefined) {
        if (
          !Number.isFinite(declaration.budgetMs) ||
          declaration.budgetMs <= 0 ||
          declaration.reason.trim() === ""
        )
          failures.push(
            `${testPath}: ${assertion.fullName ?? "unknown test"} has an invalid slow integration declaration`,
          );
        if (duration > declaration.budgetMs / 2)
          failures.push(
            `${testPath}: ${assertion.fullName ?? "unknown test"} measured ${duration.toFixed(1)}ms over half its ${declaration.budgetMs}ms budget`,
          );
      }
    }
  }
}

for (const item of expected) {
  const key = `${item.path}\n${item.fullName}`;
  const declaration = declarations.get(key);
  if (declaration === undefined) {
    failures.push(
      `${item.path}: expected slow integration no longer exists or is undeclared: ${item.fullName}`,
    );
    continue;
  }
  if (
    declaration.budgetMs !== item.declaration.budgetMs ||
    declaration.reason !== item.declaration.reason
  )
    failures.push(`${item.path}: declaration changed for ${item.fullName}`);
}

if (failures.length > 0) fail(failures);
console.log(
  `slow tests accounted: ${declarations.size} declared, ${logicUnderThreshold} logic under 1.5 s`,
);

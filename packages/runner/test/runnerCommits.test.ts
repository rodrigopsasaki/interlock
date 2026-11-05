import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { isErr, ok, type Result } from "@phyxiusjs/fp";
import { debriefFilePath, readDebriefFile } from "debrief";
import { loadGraphDocumentText, renderOutcome, sharedJournalDirectory } from "face";
import { readRawEvents } from "ledger";
import { noneClient } from "substrate";
import { verifyDebrief } from "verifier";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import {
  fixtureGit,
  initFixtureRepository,
  writeGitForwarder,
} from "../../../test/support/gitFixture.ts";
import { runDebriefFileDerived, runDebriefPrepare } from "../../cli/src/debrief/derived.ts";
import { runGraphApprove } from "../../cli/src/graph/approve.ts";
import { runInterlockRun } from "../../cli/src/run.ts";
import { buildOpeningPrompt } from "../src/openingPrompt.ts";
import {
  type CommitCustody,
  commitRunnerCode,
  declaredCommitPath,
  sessionArtifact,
} from "../src/runnerCommits.ts";
import type { Runtime } from "../src/runtime.ts";
import { type DriveSessionRequest, driveInteractiveSession } from "../src/sessionDrive.ts";
import { uncommittedPaths } from "../src/worktree.ts";
import {
  isolateGitForThisProcess,
  legacyLocalYaml,
  selectedRuntime,
} from "./support/driveFixture.ts";
import { memoryLedgerWithLog } from "./support/memoryLedger.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });
let directory = "";
let restoreGit: (() => void) | undefined;
let savedPath: string | undefined;

beforeEach(() => {
  restoreGit = isolateGitForThisProcess();
  savedPath = process.env["PATH"];
  directory = realpathSync(mkdtempSync(join(runsRoot, "runner-commits-")));
});
afterEach(() => {
  restoreGit?.();
  process.env["PATH"] = savedPath;
  execFileSync("rm", ["-r", directory]);
});
function git(root: string, args: readonly string[]): string {
  return fixtureGit(args, { cwd: root }).trim();
}
function value<T>(result: Result<T, string>): T {
  if (isErr(result)) throw new Error(result.error);
  return result.value;
}
function write(root: string, path: string, bytes: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), bytes);
}
const sessionPath = ".interlock/sessions/g/n";
function repository(
  paths?: readonly string[],
  ignoredScreen = true,
): {
  root: string;
  request: CommitCustody;
  base: string;
} {
  const root = join(directory, "repo");
  mkdirSync(root);
  initFixtureRepository(root, { defaultBranch: "main" });
  git(root, ["config", "user.name", "fixture"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]);
  write(root, "tracked.txt", "before\n");
  write(
    root,
    ".gitignore",
    `.worktrees/\n.interlock/ledger/\n.interlock/local.yaml\n${ignoredScreen ? ".interlock/sessions/**/screen.txt\n" : ""}ignored.txt\n`,
  );
  write(
    root,
    ".interlock/graphs/g.yaml",
    stringify({
      interlock: "graph@v0",
      id: "g",
      gates: [{ id: "approved", kind: "human" }],
      nodes: [{ id: "n", acceptance: "fixture", ...(paths === undefined ? {} : { paths }) }],
    }),
  );
  write(root, ".interlock/config.yaml", "interlock: config@v0\nstanding_gates: []\n");
  write(
    root,
    `${sessionPath}/brief.md`,
    "---\ninterlock: brief@v1\ngraph: g\nnode: n\nrole: worker\ngates: []\nscope: []\nsubstrate:\n  address: none\n---\n",
  );
  write(root, "AGENTS.md", "## Vocabulary\n\n| term | means |\n| --- | --- |\n| node | work |\n");
  git(root, [
    "add",
    "--",
    "tracked.txt",
    ".gitignore",
    ".interlock/graphs/g.yaml",
    ".interlock/config.yaml",
    `${sessionPath}/brief.md`,
    "AGENTS.md",
  ]);
  git(root, ["-c", "commit.gpgsign=false", "commit", "-m", "fixture base"]);
  const base = git(root, ["rev-parse", "HEAD"]);
  signing(root);
  return {
    root,
    base,
    request: {
      worktree: root,
      graph: "g",
      node: "n",
      session: "attempt-1",
      runtime: "fixture",
      model: "fixture-model",
    },
  };
}
function signing(root: string, failAt = 0): void {
  const program = join(directory, "signer");
  const count = join(directory, "sign-count");
  writeFileSync(
    program,
    [
      "#!/bin/sh",
      "cat >/dev/null",
      `count=$(cat '${count}' 2>/dev/null || printf 0)`,
      "count=$((count + 1))",
      `printf '%s' "$count" > '${count}'`,
      `if [ "$count" -eq ${failAt} ]; then echo 'fixture signing failed' >&2; exit 1; fi`,
      "printf '%s\\n' '-----BEGIN PGP SIGNATURE-----' '' 'Zml4dHVyZQ==' '-----END PGP SIGNATURE-----'",
      "echo '[GNUPG:] SIG_CREATED D 1 10 00 0 0123456789012345678901234567890123456789' >&2",
      "",
    ].join("\n"),
  );
  chmodSync(program, 0o755);
  git(root, ["config", "gpg.format", "openpgp"]);
  git(root, ["config", "gpg.program", program]);
  git(root, ["config", "user.signingkey", "fixture"]);
  git(root, ["config", "commit.gpgsign", "true"]);
}
function plan(
  root: string,
  entries: readonly { message: string; paths: readonly string[] }[] = [],
  fallback?: string,
): void {
  write(
    root,
    `${sessionPath}/commits.yaml`,
    stringify({
      interlock: "commits@v0",
      entries,
      ...(fallback === undefined ? {} : { fallback_subject: fallback }),
      co_authored_by: "Fixture Model <fixture@example.invalid>",
    }),
  );
}
function recordGit(): string {
  const bin = join(directory, "bin");
  mkdirSync(bin);
  const log = join(directory, "git-argv");
  writeGitForwarder(join(bin, "git"), [], log);
  process.env["PATH"] = `${bin}${delimiter}${savedPath ?? ""}`;
  return log;
}
function subjects(root: string, base: string): string[] {
  return git(root, ["log", "--reverse", "--format=%s", `${base}..HEAD`])
    .split("\n")
    .filter(Boolean);
}

it("prompts runner custody explicitly while agent custody keeps today's instructions", () => {
  const runner = buildOpeningPrompt(
    "g",
    "n",
    undefined,
    "implementer",
    undefined,
    undefined,
    "runner",
  );
  expect(runner).toContain("Do not commit");
  expect(runner).toContain("commits.yaml");
  expect(runner).not.toContain("commit as you go");
  expect(buildOpeningPrompt("g", "n")).toContain("commit as you go");
});

it("commits entries in order, signs and adds both attempt trailers and authorship, then falls back", () => {
  const { root, request, base } = repository();
  write(root, "first.txt", "first\n");
  write(root, "second.txt", "second\n");
  write(root, "tracked.txt", "after\n");
  write(root, "ignored.txt", "ignored\n");
  plan(
    root,
    [
      { message: "feat: first because ordered", paths: ["first.txt"] },
      { message: "feat: second because ordered", paths: ["second.txt"] },
    ],
    "fix: keep remainder",
  );
  const log = recordGit();
  const code = value(commitRunnerCode(request));
  expect(subjects(root, base)).toEqual([
    "feat: first because ordered",
    "feat: second because ordered",
    "fix: keep remainder",
  ]);
  for (const sha of git(root, ["rev-list", `${base}..${code.head}`]).split("\n")) {
    const raw = git(root, ["cat-file", "commit", sha]);
    expect(raw).toContain("gpgsig -----BEGIN PGP SIGNATURE-----");
    expect(raw).toContain("Attempt: attempt-1");
    expect(raw).toContain("Runtime: fixture (fixture-model)");
    expect(raw).toContain("Co-Authored-By: Fixture Model <fixture@example.invalid>");
  }
  expect(git(root, ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"])).toBe(
    "tracked.txt",
  );
  const calls = readFileSync(log, "utf-8").split("\n");
  expect(calls).not.toContain("-A");
  expect(calls).not.toContain(".");
  expect(calls).toContain("--literal-pathspecs");
  expect(calls).toContain("-S");
});

it("does not commit when the plan and changed code paths are empty", () => {
  const { root, request, base } = repository();
  plan(root);
  expect(value(commitRunnerCode(request)).head).toBe(base);
  expect(git(root, ["rev-parse", "HEAD"])).toBe(base);
});

it.each([1, 2])("rolls back all declared commits when signing commit %i fails", (failAt) => {
  const { root, request, base } = repository();
  signing(root, failAt);
  write(root, "first.txt", "first\n");
  write(root, "second.txt", "second\n");
  plan(root, [
    { message: "feat: first", paths: ["first.txt"] },
    { message: "feat: second", paths: ["second.txt"] },
  ]);
  const result = commitRunnerCode(request);
  expect(isErr(result)).toBe(true);
  if (isErr(result)) expect(result.error).toContain("fixture signing failed");
  expect(git(root, ["rev-parse", "HEAD"])).toBe(base);
  expect(git(root, ["diff", "--cached", "--name-only"])).toBe("");
  expect(readFileSync(join(root, "first.txt"), "utf-8")).toBe("first\n");
  expect(readFileSync(join(root, "second.txt"), "utf-8")).toBe("second\n");
});

const secretCases: readonly [string, string, string][] = [
  [".env", ".env", "ordinary"],
  [".env.*", ".env.local", "ordinary"],
  ["*.pem", "sign.pem", "ordinary"],
  ["*.key", "sign.key", "ordinary"],
  ["*.p12", "sign.p12", "ordinary"],
  ["*.pfx", "sign.pfx", "ordinary"],
  ["id_rsa*", "id_rsa.pub", "ordinary"],
  ["id_ed25519*", "id_ed25519.pub", "ordinary"],
  ["*credentials*", "app-credentials.json", "ordinary"],
  ["*.keystore", "app.keystore", "ordinary"],
  [".npmrc", ".npmrc", "ordinary"],
  [".pypirc", ".pypirc", "ordinary"],
  [".netrc", ".netrc", "ordinary"],
  ["PEM private-key header", "private.txt", ["-----", "BEGIN RSA PRIVATE KEY", "-----"].join("")],
  ["AWS access key id", "aws.txt", "AKIA" + "X".repeat(16)],
  ...["ghp_", "gho_", "ghs_", "github_pat_"].map((prefix): [string, string, string] => [
    "GitHub token",
    `${prefix}.txt`,
    prefix + "X".repeat(20),
  ]),
];

const invalidPlans: readonly [
  string,
  readonly { message: string; paths: readonly string[] }[],
  string | undefined,
][] = [
  [
    "duplicate path",
    [
      { message: "fix: first", paths: ["changed.txt"] },
      { message: "fix: second", paths: ["changed.txt"] },
    ],
    undefined,
  ],
  [
    "path did not change",
    [{ message: "fix: unchanged", paths: ["tracked.txt"] }],
    "fix: remainder",
  ],
  [
    "reserved session artifact",
    [{ message: "fix: wrong phase", paths: [`${sessionPath}/commits.yaml`] }],
    "fix: remainder",
  ],
  ["missing fallback_subject", [], undefined],
];

async function driveFixture(
  options: {
    readonly changed?: readonly [string, string][];
    readonly entries?: readonly { message: string; paths: readonly string[] }[];
    readonly fallback?: string;
    readonly paths?: readonly string[];
    readonly failAt?: number;
    readonly agentMode?: boolean;
    readonly phase2Extra?: boolean;
    readonly cli?: boolean;
    readonly ignoredScreen?: boolean;
  } = {},
) {
  const { root, base } = repository(options.paths, options.ignoredScreen);
  signing(root, options.failAt);
  write(root, ".interlock/local.yaml", legacyLocalYaml(["kind: fake"]));
  const catalogue = join(directory, "runtimes.yaml");
  writeFileSync(
    catalogue,
    `interlock: runtimes@v1\nruntimes:\n  fixture:\n    kind: fake\n    model: fixture-model\n    commits: ${options.agentMode === true ? "agent" : "runner"}\n`,
  );
  const selected = await selectedRuntime(root, catalogue, "fixture");
  const { ledger, events } = memoryLedgerWithLog();
  let worktree = "";
  let phase = 0;
  const prompts: string[] = [];
  const runtime: Runtime = {
    openPane: (cwd) => {
      worktree = cwd;
      return Promise.resolve(ok({ id: "pane" }));
    },
    startAgent: (pane) => Promise.resolve(ok({ id: "agent", pane })),
    reportIdentity: () => Promise.resolve(ok(undefined)),
    prompt: async (_agent, text) => {
      prompts.push(text);
      phase += 1;
      if (phase === 1) {
        for (const [path, content] of options.changed ?? [["changed.txt", "changed\n"]])
          write(worktree, path, content);
        if (options.agentMode !== true) plan(worktree, options.entries ?? [], options.fallback);
      } else {
        const started = events.find((event) => event.kind === "session-started");
        if (started === undefined) throw new Error("missing fixture session event");
        const journal = await sharedJournalDirectory(worktree);
        mkdirSync(journal, { recursive: true });
        writeFileSync(
          join(journal, "journal.jsonl"),
          `${JSON.stringify({ interlock: "event@v9", ...started })}\n`,
        );
        const candidate = join(worktree, sessionPath, "final.candidate.yaml");
        const prepared = await runDebriefPrepare(
          [
            "g",
            "n",
            "--to",
            candidate,
            "--agent-runtime",
            "fixture",
            "--agent-model",
            "fixture-model",
          ],
          { cwd: worktree },
        );
        expect(prepared.exitCode, prepared.message).toBe(0);
        const filed = await runDebriefFileDerived(["g", "n", "--from", candidate], {
          cwd: worktree,
        });
        expect(filed.exitCode, filed.message).toBe(0);
        write(worktree, `${sessionPath}/notes.yaml`, "interlock: notes@v0\nnode: n\nentries: []\n");
        write(worktree, `${sessionPath}/fresh.candidate.yaml`, readFileSync(candidate, "utf-8"));
        write(worktree, `${sessionPath}/candidate.yaml`, readFileSync(candidate, "utf-8"));
        write(worktree, `${sessionPath}/candidate.source.yaml`, "source\n");
        write(worktree, `${sessionPath}/authored.yaml`, readFileSync(candidate, "utf-8"));
        write(worktree, `${sessionPath}/revisions/prior.yaml`, readFileSync(candidate, "utf-8"));
        if (options.phase2Extra === true) write(worktree, "late.txt", "late code\n");
      }
      return ok(undefined);
    },
    waitUntil: (_agent, until) => Promise.resolve(ok(until.includes("idle") ? "idle" : "working")),
    read: () => Promise.resolve(ok("agent finished")),
    sendKeys: () => Promise.resolve(ok(undefined)),
    sendPaneKeys: () => Promise.resolve(ok(undefined)),
    closePane: () => Promise.resolve(ok(undefined)),
    observe: () =>
      Promise.resolve(
        ok({
          attempt: () => ({
            agentStatus: "idle",
            pane: { state: "known", address: "pane" },
            liveWork: () => Promise.resolve({ state: "none" }),
          }),
        }),
      ),
  };
  const request: DriveSessionRequest = {
    repoRoot: root,
    graph: "g",
    node: "n",
    role: "worker",
    acceptance: "fixture",
    nodeGates: [],
    localConfig: { ...selected.localConfig, answerGraceMs: 0 },
    agentRuntime: selected.agentRuntime,
    standingGates: [],
    substrate: noneClient(),
    ledger,
    clock: createControlledClock({ initialTime: 0 }),
    narrate: () => undefined,
    runtime,
    runnerIdPrefix: "fixture",
    ...(options.paths === undefined ? {} : { paths: options.paths }),
    composeBrief: (tree, graphBase, session) => {
      const started = events.find((event) => event.kind === "session-started");
      if (started === undefined || started.kind !== "session-started")
        throw new Error("missing session");
      const path = join(tree, sessionPath, "brief.md");
      write(
        tree,
        `${sessionPath}/brief.md`,
        `---\ninterlock: brief@v1\ngraph: g\nnode: n\nrole: worker\ngates: []\nscope: ${JSON.stringify(started.brief.scope)}\nsubstrate:\n  address: none\ngraph_base_sha: ${graphBase}\nsession: ${session}\n---\n`,
      );
      return Promise.resolve(ok({ path, narration: [] }));
    },
  };
  if (options.cli === true) {
    const approved = await runGraphApprove(
      ["g", "--by", "fixture", "--because", "fixture approval"],
      { cwd: root },
    );
    expect(approved.exitCode, approved.message).toBe(0);
    const previousCatalogue = process.env["INTERLOCK_RUNTIMES"];
    process.env["INTERLOCK_RUNTIMES"] = catalogue;
    try {
      const result = await runInterlockRun(["g", "n", "--runtime", "fixture"], {
        cwd: root,
        runtime,
        clock: request.clock,
        narrate: () => undefined,
      });
      const recorded = await readRawEvents(await sharedJournalDirectory(root));
      if (isErr(recorded)) throw new Error("fixture journal unreadable");
      return { result, events: recorded.value, worktree, prompts, base };
    } finally {
      if (previousCatalogue === undefined) delete process.env["INTERLOCK_RUNTIMES"];
      else process.env["INTERLOCK_RUNTIMES"] = previousCatalogue;
    }
  }
  const result = await driveInteractiveSession(request);
  return { result, events, worktree, prompts, base };
}

function expectFailed(drive: Awaited<ReturnType<typeof driveFixture>>, reason: string): void {
  expect(drive.result.exitCode).toBe(1);
  expect(drive.result.message).toContain(reason);
  const failures = drive.events.flatMap((event) =>
    event.kind === "outcome-set" && event.outcome.kind === "failed" ? [event.outcome] : [],
  );
  expect(failures).toHaveLength(1);
  for (const failure of failures) {
    expect(failure.failure.length).toBeGreaterThan(0);
    expect(failure.disposition).toBe("repair");
    expect(renderOutcome(failure)).toContain(reason);
  }
}

describe("session refuses and records every unsafe attempt", () => {
  it.each(secretCases)(
    "refuses %s at %s without disclosing content",
    async (rule, path, content) => {
      const drive = await driveFixture({ changed: [[path, content]], fallback: "fix: remainder" });
      expectFailed(drive, rule);
      expect(drive.result.message).toContain(path);
      expect(drive.result.message).not.toContain(content);
      expect(drive.prompts).toHaveLength(1);
    },
  );
  it.each(invalidPlans)("refuses invalid plan: %s", async (reason, entries, fallback) => {
    const drive = await driveFixture({ entries, ...(fallback === undefined ? {} : { fallback }) });
    expectFailed(drive, reason);
    expect(drive.prompts).toHaveLength(1);
  });
  it("threads the graph's paths into the check", async () => {
    const graph = loadGraphDocumentText(
      "interlock: graph@v0\nid: g\nnodes:\n  - id: n\n    paths: [src/**]\n",
      "graph.yaml",
    );
    if (isErr(graph)) throw new Error(JSON.stringify(graph.error));
    const paths = graph.value.nodes[0]?.paths;
    expect(paths).toEqual(["src/**"]);
    const drive = await driveFixture({
      ...(paths === undefined ? {} : { paths }),
      fallback: "fix: remainder",
    });
    expectFailed(drive, "changed.txt: outside declared paths");
  });
  it("records signing failure in the position", async () => {
    const drive = await driveFixture({ failAt: 2, fallback: "fix: remainder" });
    expectFailed(drive, "fixture signing failed");
    expect(existsSync(join(drive.worktree, "changed.txt"))).toBe(true);
  });
  it("refuses leftover code in phase 2 rather than holding it", async () => {
    const drive = await driveFixture({ fallback: "fix: remainder", phase2Extra: true });
    expectFailed(drive, "late.txt: still dirty");
  });
});

it("settles dirty code, prepares at the runner HEAD, commits all debrief artifacts last and judges clean", async () => {
  const drive = await driveFixture({ fallback: "fix: preserve fixture code" });
  expect(drive.result.exitCode, drive.result.message).toBe(0);
  expect(drive.result.message).toContain("cleared");
  expect(drive.prompts[1]).toContain("Your code is committed at");
  const read = await readDebriefFile(debriefFilePath(drive.worktree, "g", "n"));
  if (isErr(read) || read.value.kind !== "v2") throw new Error("expected v2");
  const head = git(drive.worktree, ["rev-parse", "HEAD"]);
  const code = git(drive.worktree, ["rev-parse", "HEAD^"]);
  expect(read.value.debrief.headSha).toBe(code);
  expect(subjects(drive.worktree, code)).toEqual(["chore: preserve the debrief for n"]);
  expect(git(drive.worktree, ["cat-file", "commit", head])).toContain(
    "gpgsig -----BEGIN PGP SIGNATURE-----",
  );
  const dirty = uncommittedPaths(drive.worktree);
  if (isErr(dirty)) throw new Error(JSON.stringify(dirty.error));
  expect(dirty.value).toEqual([]);
  const verified = await verifyDebrief(drive.worktree, read.value.debrief);
  if (isErr(verified)) throw new Error("verifier refused range");
  expect(verified.value.marks.some((mark) => mark.kind === "unexplained")).toBe(true);
  const finalPaths = git(drive.worktree, [
    "diff-tree",
    "--no-commit-id",
    "--name-only",
    "-r",
    "HEAD",
  ]).split("\n");
  expect(finalPaths).toContain(`${sessionPath}/candidate.source.yaml`);
  expect(finalPaths).toContain(`${sessionPath}/final.candidate.yaml`);
  expect(finalPaths.every((path) => sessionArtifact(path, "g", "n", drive.worktree))).toBe(true);
});

it("agent mode retains dirty-worktree holding without runner commits or phase 2", async () => {
  const drive = await driveFixture({ agentMode: true });
  expect(drive.result.message).toContain("held");
  expect(drive.prompts).toHaveLength(1);
  expect(drive.prompts[0]).toContain("commit as you go");
  expect(subjects(drive.worktree, drive.base)).toHaveLength(1);
});

it("retains the code HEAD and every artifact when signing the debrief fails", async () => {
  const drive = await driveFixture({ fallback: "fix: keep code", failAt: 3 });
  expectFailed(drive, "fixture signing failed");
  expect(git(drive.worktree, ["show", "-s", "--format=%s", "HEAD"])).toBe("fix: keep code");
  expect(git(drive.worktree, ["diff", "--cached", "--name-only"])).toBe("");
  const dirty = uncommittedPaths(drive.worktree);
  if (isErr(dirty)) throw new Error(JSON.stringify(dirty.error));
  expect(dirty.value).toContain(`${sessionPath}/debrief.yaml`);
  expect(dirty.value).toContain(`${sessionPath}/final.candidate.yaml`);
});

it("rolls the attempt back before either code entry when signing its second code commit fails", async () => {
  const drive = await driveFixture({
    failAt: 3,
    changed: [
      ["one.txt", "one"],
      ["two.txt", "two"],
    ],
    entries: [
      { message: "fix: one", paths: ["one.txt"] },
      { message: "fix: two", paths: ["two.txt"] },
    ],
  });
  expectFailed(drive, "fixture signing failed");
  expect(git(drive.worktree, ["show", "-s", "--format=%s", "HEAD"])).toBe(
    "chore: write the session brief for n",
  );
  expect(readFileSync(join(drive.worktree, "one.txt"), "utf-8")).toBe("one");
  expect(readFileSync(join(drive.worktree, "two.txt"), "utf-8")).toBe("two");
  expect(git(drive.worktree, ["diff", "--cached", "--name-only"])).toBe("");
});

it("commits literal unusual names and deletions without including unrelated staged artifacts", () => {
  const { root, request, base } = repository();
  unlinkSync(join(root, "tracked.txt"));
  const literal = 'space é "quote" :name.txt';
  write(root, literal, "literal\n");
  plan(root, [
    { message: "fix: preserve literal paths and deletions", paths: [literal, "tracked.txt"] },
  ]);
  git(root, ["add", "--", `${sessionPath}/commits.yaml`]);
  value(commitRunnerCode(request));
  expect(subjects(root, base)).toEqual(["fix: preserve literal paths and deletions"]);
  expect(git(root, ["ls-tree", "-r", "--name-only", "HEAD", sessionPath])).toBe(
    `${sessionPath}/brief.md`,
  );
  expect(git(root, ["show", `HEAD:${literal}`])).toBe("literal");
});

it("checks both sides of a staged rename before committing", () => {
  const { root, request } = repository();
  renameSync(join(root, "tracked.txt"), join(root, "renamed.txt"));
  git(root, ["add", "--", "tracked.txt", "renamed.txt"]);
  plan(root, [], "fix: keep rename");
  const existingCount = uncommittedPaths(root);
  if (isErr(existingCount)) throw new Error(JSON.stringify(existingCount.error));
  expect(existingCount.value).toContain("renamed.txt");
  expect(existingCount.value).not.toContain("tracked.txt");
  const result = commitRunnerCode({ ...request, paths: ["renamed.txt"] });
  expect(isErr(result)).toBe(true);
  if (isErr(result)) expect(result.error).toContain("tracked.txt: outside declared paths");
  value(commitRunnerCode(request));
  expect(git(root, ["show", "HEAD:renamed.txt"])).toBe("before");
});

it("defaults to safe new paths, keeps own artifacts declared, and refuses graph and other-session paths", () => {
  const { request } = repository();
  expect(declaredCommitPath("new/deep/file.ts", request)).toBe(true);
  expect(declaredCommitPath(`${sessionPath}/commits.yaml`, { ...request, paths: [] })).toBe(true);
  for (const path of [
    ".git/config",
    ".interlock/graphs/other.yaml",
    ".interlock/sessions/g/other/notes.yaml",
  ]) {
    expect(declaredCommitPath(path, request)).toBe(false);
  }
});

it("bounds the content scan at the first 64 KB", () => {
  const { root, request } = repository();
  write(root, "large.txt", `${"x".repeat(64 * 1024)}${"AKIA"}${"X".repeat(16)}`);
  plan(root, [], "fix: preserve bounded scan");
  expect(isErr(commitRunnerCode(request))).toBe(false);
});

it("carries declared paths through interlock run from the approved graph to the commit refusal", async () => {
  const drive = await driveFixture({ cli: true, paths: ["src/**"], fallback: "fix: remainder" });
  expectFailed(drive, "changed.txt: outside declared paths");
});

it("keeps judging clean even when the repository does not ignore screen snapshots", async () => {
  const drive = await driveFixture({
    fallback: "fix: preserve clean judging",
    ignoredScreen: false,
  });
  expect(drive.result.exitCode, drive.result.message).toBe(0);
  expect(drive.result.message).toContain("cleared");
  expect(git(drive.worktree, ["status", "--porcelain"])).toBe("");
});

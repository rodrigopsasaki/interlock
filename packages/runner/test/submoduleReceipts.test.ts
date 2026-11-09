import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { isErr, unwrap } from "@phyxiusjs/fp";
import { parseBriefGate } from "debrief";
import { loadGraphDocumentText } from "face";
import { explainScopeRefusal, fileScope, nodeKey, receiptId, scopeEntry } from "ledger";
import { noneClient } from "substrate";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  cloneFixtureRepository,
  fixtureGit,
  initFixtureRepository,
} from "../../../test/support/gitFixture.ts";
import { judgeGates } from "../src/gateJudge.ts";
import { gitScope } from "../src/scope.ts";
import { commitAll, gitInitFixtureWithContent, headSha } from "./support/gitFixture.ts";
import { memoryLedger } from "./support/memoryLedger.ts";
import { slowIntegration } from "./support/slowIntegration.ts";
import { allocateToolState } from "./support/toolState.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });
const toolState = allocateToolState("submodule-receipts-mise");

const passCommand = `${process.execPath} -e process.exit(0)`;
const node = { graph: "fixture", id: "n1" };
const ZOID = "b".repeat(40);

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

afterAll(() => {
  toolState.cleanup();
});

interface SubmoduleFixture {
  readonly parent: string;
  readonly submodule: string;
  readonly recorded: string;
}

function submoduleFixture(): SubmoduleFixture {
  directory = mkdtempSync(join(runsRoot, "submodule-"));
  const submodule = join(directory, "upstream");
  const parent = join(directory, "parent");
  mkdirSync(submodule);
  mkdirSync(parent);
  writeFileSync(join(submodule, "lib.txt"), "library\n");
  gitInitFixtureWithContent(submodule);
  writeFileSync(join(parent, "root.txt"), "root\n");
  gitInitFixtureWithContent(parent);
  fixtureGit(
    ["-c", "protocol.file.allow=always", "submodule", "add", "--quiet", submodule, "mod"],
    { cwd: parent },
  );
  commitAll(parent, "add the submodule");
  return { parent, submodule, recorded: headSha(submodule) };
}

function plainRepository(): string {
  directory = mkdtempSync(join(runsRoot, "plain-"));
  writeFileSync(join(directory, "root.txt"), "root\n");
  gitInitFixtureWithContent(directory);
  return directory;
}

async function idOf(root: string, gate = "proof"): Promise<string> {
  return unwrap(await receiptId(root, gitScope(root), gate));
}

function recordGitlink(root: string, path: string, commit: string): void {
  fixtureGit(["update-index", "--add", "--cacheinfo", `160000,${commit},${path}`], { cwd: root });
}

describe("a scope that holds a gitlink", () => {
  it("reads the gitlink as a gitlink at its recorded commit, and every other tracked path as a file", () => {
    const fixture = submoduleFixture();
    expect(gitScope(fixture.parent)).toEqual(
      expect.arrayContaining([
        scopeEntry.gitlink("mod", fixture.recorded),
        scopeEntry.file("root.txt"),
        scopeEntry.file(".gitmodules"),
      ]),
    );
  });

  slowIntegration(
    "is judged into a receipt without throwing",
    {
      budgetMs: 10_000,
      reason: "integrates a Git index containing a submodule gitlink with gate judging",
    },
    async () => {
      const fixture = submoduleFixture();
      const ledger = memoryLedger();
      const judged = await judgeGates({
        ledger,
        clock: createControlledClock(),
        node,
        session: "s1",
        declaredGateIds: ["always-pass"],
        commandFor: new Map([["always-pass", { kind: "command", run: passCommand }]]),
        worktree: fixture.parent,
        scopeRoot: fixture.parent,
        scopePaths: gitScope(fixture.parent),
        commitSha: headSha(fixture.parent),
        runnerId: "run-1",
        holdMs: 60_000,
        substrate: noneClient(),
        env: toolState.environment,
        narrate: () => {},
      });
      if (isErr(judged)) throw new Error("expected an outcome");
      expect(judged.value.kind).toBe("cleared");
      expect(ledger.projection().nodes.get(nodeKey(node))?.receipts).toHaveLength(1);
    },
  );

  it("changes its receipt id when a submodule bump is committed, and not when only the working checkout changes", async () => {
    const fixture = submoduleFixture();
    const before = await idOf(fixture.parent);

    const checkout = join(fixture.parent, "mod");
    writeFileSync(join(checkout, "lib.txt"), "edited in the working checkout\n");
    commitAll(checkout, "advance the checkout only");
    writeFileSync(join(checkout, "untracked.txt"), "scratch\n");
    expect(await idOf(fixture.parent)).toBe(before);

    fixtureGit(["add", "mod"], { cwd: fixture.parent });
    commitAll(fixture.parent, "bump the submodule");
    expect(await idOf(fixture.parent)).not.toBe(before);
  });

  it("hashes an uninitialized submodule, and one missing from disk, the same way", async () => {
    const fixture = submoduleFixture();
    const before = await idOf(fixture.parent);

    const clone = join(fixture.parent, "..", "clone");
    cloneFixtureRepository(fixture.parent, clone, ["--quiet"]);
    expect(await idOf(clone)).toBe(before);

    rmSync(join(clone, "mod"), { recursive: true, force: true });
    expect(await idOf(clone)).toBe(before);
  });

  it("separates a regular file holding a commit id from a gitlink to that commit", async () => {
    const root = plainRepository();
    const commit = "a".repeat(40);
    writeFileSync(join(root, "mod"), commit);
    fixtureGit(["add", "mod"], { cwd: root });
    const asFile = await idOf(root);

    fixtureGit(["rm", "--cached", "--quiet", "mod"], { cwd: root });
    recordGitlink(root, "mod", commit);
    const asGitlink = await idOf(root);

    expect(asGitlink).not.toBe(asFile);
  });

  it("separates a file named gitlink holding NUL sub NUL and a commit id from a gitlink sub at that commit", async () => {
    const root = plainRepository();
    const commit = "a".repeat(40);
    writeFileSync(join(root, "gitlink"), `\u0000sub\u0000${commit}`);

    const asFile = unwrap(
      await receiptId(root, [scopeEntry.file("gitlink"), scopeEntry.file("root.txt")], "proof"),
    );
    const asGitlink = unwrap(
      await receiptId(
        root,
        [scopeEntry.gitlink("sub", commit), scopeEntry.file("root.txt")],
        "proof",
      ),
    );
    const bare = unwrap(await receiptId(root, [scopeEntry.file("gitlink")], "proof"));
    const bareGitlink = unwrap(await receiptId(root, [scopeEntry.gitlink("sub", commit)], "proof"));

    expect(asGitlink).not.toBe(asFile);
    expect(bareGitlink).not.toBe(bare);
  });

  it("separates the mixed scope pair that only the framing keeps apart", async () => {
    const root = plainRepository();
    const commit = "a".repeat(40);
    writeFileSync(join(root, "gitlink"), `\u0000sub\u0000${commit}`);

    const scopeA = [scopeEntry.file("gitlink"), scopeEntry.gitlink("z", ZOID)];
    const scopeB = [scopeEntry.gitlink("sub", commit), scopeEntry.gitlink("z", ZOID)];

    expect(unwrap(await receiptId(root, scopeA, "proof"))).not.toBe(
      unwrap(await receiptId(root, scopeB, "proof")),
    );
  });

  it("is unaffected by the order its entries arrive in", async () => {
    const fixture = submoduleFixture();
    const entries = gitScope(fixture.parent);
    const forward = unwrap(await receiptId(fixture.parent, entries, "proof"));
    const backward = unwrap(await receiptId(fixture.parent, [...entries].reverse(), "proof"));
    expect(forward).toBe(backward);
  });
});

describe("a scope of regular files only", () => {
  it("keeps the receipt id it had before gitlinks were framed", async () => {
    directory = mkdtempSync(join(runsRoot, "files-"));
    writeFileSync(join(directory, "a.txt"), "alpha\n");
    writeFileSync(join(directory, "b.txt"), "beta\n");
    initFixtureRepository(directory);

    expect(unwrap(await receiptId(directory, fileScope(["b.txt", "a.txt"]), "fixed-gate"))).toBe(
      "e5e58f319e9f57fe299754f732507490bdef557632b0b2e972c25bf597fd5af7",
    );
  });
});

describe("a gate id containing NUL", () => {
  const gate = "pro\u0000of";

  it("is refused by receiptId, with its line", async () => {
    const root = plainRepository();
    const refused = await receiptId(root, gitScope(root), gate);
    if (!isErr(refused)) throw new Error("expected a refusal");
    expect(refused.error).toEqual({ kind: "gate-contains-nul", gate });
    expect(explainScopeRefusal(refused.error)).toBe(
      '"pro\\u0000of": a gate id may not contain a NUL byte.',
    );
  });

  it("is refused at graph loading, with its line", () => {
    const loaded = loadGraphDocumentText(
      [
        "interlock: graph@v0",
        "id: demo",
        "gates:",
        '  - id: "pro\\0of"',
        "    kind: command",
        "nodes: []",
      ].join("\n"),
      "graph.yaml",
    );
    if (!isErr(loaded)) throw new Error("expected a refusal");
    expect(JSON.stringify(loaded.error)).toContain("a gate id may not contain a NUL byte");
  });

  it("is refused at gate-declaration validation, with its line", () => {
    const parsed = parseBriefGate({ id: gate, kind: "command" }, 0);
    if (!isErr(parsed)) throw new Error("expected a refusal");
    expect(parsed.error).toBe('gates[0]: "pro\\u0000of": a gate id may not contain a NUL byte.');
  });
});

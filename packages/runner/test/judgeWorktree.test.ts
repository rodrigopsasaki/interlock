import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { isErr } from "@phyxiusjs/fp";
import { sharedJournalDirectory } from "face";
import { nodeKey } from "ledger";
import { noneClient } from "substrate";
import { afterEach, describe, expect, it } from "vitest";
import { declaredGateIds } from "../src/gateCommand.ts";
import { judgeWorktree } from "../src/judgeWorktree.ts";
import { screenPath, writeScreenSnapshot } from "../src/sessionScreen.ts";
import { gitInitFixtureWithContent } from "./support/gitFixture.ts";
import { memoryLedger } from "./support/memoryLedger.ts";

const runsRoot = join(import.meta.dirname, ".runs", "judge-worktree");
mkdirSync(runsRoot, { recursive: true });

let repository: string | undefined;
let worktree: string | undefined;

afterEach(() => {
  if (repository !== undefined && worktree !== undefined) {
    execFileSync("git", ["worktree", "remove", worktree], { cwd: repository });
  }
  if (repository !== undefined) execFileSync("rm", ["-r", repository]);
  repository = undefined;
  worktree = undefined;
});

function fixture(): { readonly repository: string; readonly worktree: string } {
  repository = mkdtempSync(join(runsRoot, "judge-"));
  writeFixture(repository);
  gitInitFixtureWithContent(repository);
  worktree = `${repository}-target`;
  execFileSync("git", ["worktree", "add", "--detach", worktree, "HEAD"], {
    cwd: repository,
  });
  return { repository, worktree };
}

function writeFixture(path: string): void {
  writeFileSync(join(path, "content.txt"), "fixture\n");
}

describe("judgeWorktree", () => {
  it("keeps the runner snapshot outside an unignored target worktree and runs gates", async () => {
    const paths = fixture();
    const node = { graph: "demo", id: "a" };
    const runnerStateDirectory = sharedJournalDirectory(paths.worktree);
    const ledger = memoryLedger();
    const screen = "agent output\nfinal line\n";
    const judged = await judgeWorktree({
      ledger,
      clock: createControlledClock(),
      node,
      session: "session-1",
      declaredGateIds: declaredGateIds([], [{ id: "proof", kind: "command", run: "true" }]),
      commandFor: new Map([["proof", { kind: "command", run: "true" }]]),
      worktree: paths.worktree,
      narrate: () => {},
      runnerId: "runner-1",
      holdMs: 60_000,
      substrate: noneClient(),
      onWorktreeRead: async () => {
        await writeScreenSnapshot(runnerStateDirectory, node.graph, node.id, screen);
      },
    });

    expect(isErr(judged)).toBe(false);
    if (isErr(judged)) return;
    expect(judged.value.kind).toBe("cleared");
    expect(readFileSync(screenPath(runnerStateDirectory, node.graph, node.id), "utf-8")).toBe(
      screen,
    );
    expect(existsSync(join(paths.worktree, ".gitignore"))).toBe(false);
    expect(ledger.projection().nodes.get(nodeKey(node))?.gates.get("proof")?.kind).toBe(
      "satisfied",
    );
  });
});

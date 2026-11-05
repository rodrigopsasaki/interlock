import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { unwrap } from "@phyxiusjs/fp";
import { notesFilePath } from "debrief";
import { createLedger, type Ledger, type Node, note, sessionRuntime } from "ledger";
import { afterEach, describe, expect, it } from "vitest";
import { appendUnrecordedNotes, recordQuestionNotes } from "../src/questionNotes.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;
const ledgers: Ledger[] = [];

afterEach(async () => {
  for (const ledger of ledgers.splice(0)) await ledger.close();
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

const node: Node = { graph: "0046-loom-feed", id: "asked-in-words" };

async function startedLedger(): Promise<{ ledger: Ledger; worktree: string }> {
  directory = mkdtempSync(join(runsRoot, "run-"));
  const ledger = unwrap(
    await createLedger({
      clock: createControlledClock({ initialTime: 0 }),
      directory: join(directory, "ledger"),
    }),
  );
  ledgers.push(ledger);
  ledger.append({
    kind: "session-started",
    session: { id: "session-1", node, runtime: sessionRuntime.unknown() },
    brief: {
      graph: node.graph,
      node: node.id,
      role: "implementer",
      acceptance: "ask in words",
      gates: [],
      scope: [],
    },
  });
  return { ledger, worktree: join(directory, "worktree") };
}

function writeNotes(worktree: string, lines: readonly string[]): void {
  const path = notesFilePath(worktree, node.graph, node.id);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(
    path,
    ["interlock: notes@v0", `node: ${node.id}`, "entries:", ...lines, ""].join("\n"),
  );
}

const choiceLines = [
  "  - kind: choice",
  '    at: "2026-11-05T01:00:00Z"',
  "    chose: kept the walk",
  "    because: it reads",
];
const questionLines = [
  "  - kind: question",
  '    at: "2026-11-05T01:30:00Z"',
  "    asked: Merge the walk now?",
  "    options: [yes, no]",
];
const question = note.question("2026-11-05T01:30:00Z", "Merge the walk now?", ["yes", "no"]);
const choice = note.choice("2026-11-05T01:00:00Z", "kept the walk", "it reads");

describe("recordQuestionNotes", () => {
  it("records only the session's question notes while it is blocked, once however often it blocks", async () => {
    const { ledger, worktree } = await startedLedger();
    writeNotes(worktree, [...choiceLines, ...questionLines]);

    await recordQuestionNotes(ledger, "session-1", worktree, node);
    await recordQuestionNotes(ledger, "session-1", worktree, node);

    expect(ledger.projection().sessions.get("session-1")?.notes).toEqual([question]);
  });

  it("records nothing, and refuses nothing, when the session has written no notes file yet", async () => {
    const { ledger, worktree } = await startedLedger();
    await recordQuestionNotes(ledger, "session-1", worktree, node);
    expect(ledger.projection().sessions.get("session-1")?.notes).toEqual([]);
  });
});

describe("appendUnrecordedNotes", () => {
  it("files every note at debrief time without recording a live-recorded question twice", async () => {
    const { ledger, worktree } = await startedLedger();
    writeNotes(worktree, [...choiceLines, ...questionLines]);
    await recordQuestionNotes(ledger, "session-1", worktree, node);

    appendUnrecordedNotes(ledger, "session-1", [choice, question]);

    expect(ledger.projection().sessions.get("session-1")?.notes).toEqual([question, choice]);
  });
});

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isErr, isOk, ok } from "@phyxiusjs/fp";
import type { FaceKey } from "face";
import { findRepoRoot, graphFilePath, loadGraphDocument, topologicalOrder } from "face";
import type { Runtime } from "runner";
import { afterEach, describe, expect, it } from "vitest";
import { runInterlockFace } from "../../src/face/run.ts";
import { gitInitFixture } from "../graph/gitFixture.ts";

// verifier-hunks' row at the Graph level is wherever the real graph's own topological order
// puts it, not its declared position in the YAML. Recomputed here so a graph edit that moves
// the node moves this test's key count with it, rather than silently drifting off target.
async function verifierHunksIndex(repoRoot: string): Promise<number> {
  const document = await loadGraphDocument(graphFilePath(repoRoot, "0001-bootstrap"));
  if (isErr(document)) throw new Error("expected the real graph");
  const order = topologicalOrder(document.value.nodes);
  const ids = isOk(order)
    ? order.value.map((node) => node.id)
    : document.value.nodes.map((node) => node.id);
  const index = ids.indexOf("verifier-hunks");
  if (index < 0) throw new Error("verifier-hunks not in the real graph");
  return index;
}

const runsRoot = join(import.meta.dirname, "..", ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

// A faithful, trimmed replay of the real shared journal's verifier-hunks history: ten real
// sessions from "the day before," nine of them never swept, one already flagged lease-expired,
// their real session ids and real (now long past) lease expiries kept intact. Extracted once
// from the repository's own journal; no live session in it.
function realVerifierHunksJournalFixture(): string {
  return join(import.meta.dirname, "fixtures", "verifier-hunks-journal.jsonl");
}

function stubRuntime(): { runtime: Runtime; statusCalls: number[] } {
  const calls: number[] = [];
  const runtime: Runtime = {
    openPane: () => Promise.resolve(ok({ id: "pane-1" })),
    startAgent: (pane) => Promise.resolve(ok({ id: "agent-1", pane })),
    reportIdentity: () => Promise.resolve(ok(undefined)),
    prompt: () => Promise.resolve(ok(undefined)),
    waitUntil: () => Promise.resolve(ok("idle")),
    read: () => Promise.resolve(ok("")),
    sendKeys: () => Promise.resolve(ok(undefined)),
    closePane: () => Promise.resolve(ok(undefined)),
    reportedAgentStatus: () => {
      calls.push(1);
      return Promise.resolve(ok("working"));
    },
  };
  return { runtime, statusCalls: calls };
}

async function* keysOf(keys: readonly FaceKey[]): AsyncIterable<FaceKey> {
  for (const key of keys) yield key;
}

function fakeStdout(): {
  write(text: string): boolean;
  writes: readonly string[];
} {
  const writes: string[] = [];
  return {
    write(text: string) {
      writes.push(text);
      return true;
    },
    writes,
  };
}

function fixture(): string {
  directory = mkdtempSync(join(runsRoot, "run-"));
  gitInitFixture(directory);
  const repoRoot = findRepoRoot(import.meta.dirname);
  if (repoRoot === undefined) {
    throw new Error("nodeLevelKeys.test.ts must run inside this repository");
  }
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  cpSync(
    join(repoRoot, ".interlock", "graphs", "0001-bootstrap.yaml"),
    join(directory, ".interlock", "graphs", "0001-bootstrap.yaml"),
  );
  mkdirSync(join(directory, ".interlock", "ledger"), { recursive: true });
  const realJournal = readFileSync(realVerifierHunksJournalFixture(), "utf-8");
  // One genuinely live session on an unrelated node in the same graph, expiry always ahead of
  // whenever this test runs, so a real herdr status lookup has exactly one session to answer
  // for and its count is countable through the injected stub — never a real socket.
  const liveElsewhere = [
    JSON.stringify({
      interlock: "event@v4",
      kind: "session-started",
      session: {
        id: "live-elsewhere-1",
        node: { graph: "0001-bootstrap", id: "scaffold" },
      },
      brief: {
        graph: "0001-bootstrap",
        node: "scaffold",
        role: "worker",
        acceptance: "x",
        gates: [],
        scope: [],
      },
    }),
    JSON.stringify({
      interlock: "event@v4",
      kind: "lease-taken",
      node: { graph: "0001-bootstrap", id: "scaffold" },
      session: "live-elsewhere-1",
      expiry: Date.now() + 3_600_000,
    }),
  ].join("\n");
  writeFileSync(
    join(directory, ".interlock", "ledger", "journal.jsonl"),
    `${realJournal}${liveElsewhere}\n`,
  );
  return directory;
}

describe("the face at the node level over the real bootstrap graph and its real verifier-hunks history", () => {
  it("Enter reaches Session on a non-live attempt, Escape returns, and ? toggles help — none of them silently doing nothing", async () => {
    const repoRoot = findRepoRoot(import.meta.dirname);
    if (repoRoot === undefined) throw new Error("expected a repo root");
    const verifierIndex = await verifierHunksIndex(repoRoot);

    const cwd = fixture();
    const { runtime, statusCalls } = stubRuntime();
    const stdout = fakeStdout();

    const keys: FaceKey[] = [
      { name: "enter" },
      ...Array.from(
        { length: verifierIndex },
        (): FaceKey => ({
          name: "char",
          char: "j",
        }),
      ),
      { name: "enter" },
      { name: "char", char: "j" },
      { name: "enter" },
      { name: "escape" },
      { name: "char", char: "?" },
      { name: "char", char: "q" },
    ];

    await runInterlockFace([], {
      cwd,
      runtime,
      stdout: stdout as unknown as NodeJS.WriteStream,
      keys: keysOf(keys),
    });

    // drawScreen always writes "clear and home" plus the frame text; strip that prefix so each
    // element below is the frame content alone, one per key that drew (every key but the
    // trailing quit), plus the very first frame drawn before any key at all.
    const CLEAR_AND_HOME = "\x1b[2J\x1b[H";
    const frames = stdout.writes
      .filter((chunk) => chunk.startsWith(CLEAR_AND_HOME))
      .map((chunk) => chunk.slice(CLEAR_AND_HOME.length));
    expect(frames.length).toBe(keys.length);

    const afterEnteringGraph = frames[1];
    expect(afterEnteringGraph).toContain("graph 0001-bootstrap");

    const atVerifierHunks = frames[verifierIndex + 1];
    expect(atVerifierHunks).toMatch(/> .*verifier-hunks/);

    const enterNodeIndex = verifierIndex + 2;
    const atNodeLevel = frames[enterNodeIndex];
    expect(atNodeLevel).toContain("verifier-hunks — ");
    expect(atNodeLevel).toContain("inverse-check");
    expect(atNodeLevel).toContain("attempts:");

    const onFirstAttempt = frames[enterNodeIndex + 1];
    expect(onFirstAttempt).toContain("71b8ec63-5917-45b7-b61e-759fa987bda9");

    const atSessionLevel = frames[enterNodeIndex + 2];
    expect(atSessionLevel).toContain(
      "0001-bootstrap/verifier-hunks · session 71b8ec63-5917-45b7-b61e-759fa987bda9",
    );
    expect(atSessionLevel).not.toBe("(loading session…)");

    const afterEscape = frames[enterNodeIndex + 3];
    expect(afterEscape).toContain("verifier-hunks — ");
    expect(afterEscape).toContain("> ");
    expect(afterEscape).toContain("inverse-check");

    const afterHelp = frames[enterNodeIndex + 4];
    expect(afterHelp).toContain("verifier-hunks — ");
    expect(afterHelp).toContain("Keys");
    expect(afterHelp).toContain("toggle this help");

    // one initial Plans-level refresh, plus a refresh on every level-changing key: Enter into
    // Graph, Enter into Node, Enter into Session, Escape back to Node — never on a "j" or "?"
    // that only moves the cursor or toggles the overlay over data already in hand.
    expect(statusCalls.length).toBe(5);
  });
});

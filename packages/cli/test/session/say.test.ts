import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { err, isErr, ok, unwrap } from "@phyxiusjs/fp";
import { attemptsFor, sharedJournalDirectory } from "face";
import {
  type Brief,
  createLedger,
  type LedgerEvent,
  note,
  readReplay,
  sessionRuntime,
} from "ledger";
import type { Agent, Runtime } from "runner";
import { afterEach, describe, expect, it } from "vitest";
import { runSessionSay } from "../../src/session/say.ts";
import { gitInitFixture } from "../graph/gitFixture.ts";

const runsRoot = join(import.meta.dirname, "..", ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

const now = Date.parse("2026-11-05T04:00:00Z");
const node = { graph: "demo", id: "a" };
const brief: Brief = {
  graph: node.graph,
  node: node.id,
  role: "implementer",
  acceptance: "say into the pane",
  gates: [],
  scope: [],
};
const question = note.question("2026-11-05T03:50:00Z", "Build on main or on the branch?", [
  "main",
  "branch",
]);
const agent: Agent = { id: "il-1234abcd", pane: { id: "w1:p1" } };

function fixture(): string {
  directory = mkdtempSync(join(runsRoot, "session-say-"));
  gitInitFixture(directory);
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  writeFileSync(
    join(directory, ".interlock", "graphs", "demo.yaml"),
    "interlock: graph@v0\nid: demo\ngates: []\nnodes:\n  - id: a\n    depends_on: []\n",
  );
  return directory;
}

function liveAttempt(expiry: number, ...after: LedgerEvent[]): LedgerEvent[] {
  return [
    { kind: "node-created", node },
    {
      kind: "session-started",
      session: { id: "session-1", node, runtime: sessionRuntime.unknown() },
      brief,
    },
    { kind: "lease-taken", node, session: "session-1", expiry },
    ...after,
  ];
}

const asked: LedgerEvent = { kind: "note-appended", session: "session-1", note: question };

async function seed(cwd: string, events: readonly LedgerEvent[]): Promise<void> {
  const ledger = unwrap(
    await createLedger({
      clock: createControlledClock({ initialTime: now }),
      directory: sharedJournalDirectory(cwd),
    }),
  );
  for (const event of events) ledger.append(event);
  await ledger.close();
}

function clock() {
  return createControlledClock({ initialTime: now });
}

interface Prompted {
  readonly agent: Agent;
  readonly text: string;
}

function paneRuntime(
  prompted: Prompted[],
  prompt: Runtime["prompt"] = (target, text) => {
    prompted.push({ agent: target, text });
    return Promise.resolve(ok(undefined));
  },
  paneLost = false,
): Runtime {
  return {
    openPane: () => Promise.resolve(ok({ id: "unused" })),
    startAgent: (pane) => Promise.resolve(ok({ id: "unused", pane })),
    reportIdentity: () => Promise.resolve(ok(undefined)),
    prompt,
    waitUntil: () => Promise.resolve(ok("idle")),
    read: () => Promise.resolve(ok("")),
    sendKeys: () => Promise.resolve(ok(undefined)),
    sendPaneKeys: () => Promise.resolve(ok(undefined)),
    closePane: () => Promise.resolve(ok(undefined)),
    resolveAgent: (query) =>
      Promise.resolve(
        ok(
          !paneLost && query.graph === "demo" && query.node === "a" && query.session === "session-1"
            ? agent
            : undefined,
        ),
      ),
  };
}

function journalKinds(cwd: string): readonly string[] {
  return readFileSync(join(sharedJournalDirectory(cwd), "journal.jsonl"), "utf-8")
    .trim()
    .split("\n")
    .map((line): unknown => JSON.parse(line))
    .map((parsed) =>
      typeof parsed === "object" && parsed !== null && "kind" in parsed ? String(parsed.kind) : "",
    );
}

async function attemptAt(cwd: string, status: "blocked" | "working" = "blocked") {
  const replayed = await readReplay(sharedJournalDirectory(cwd));
  if (isErr(replayed)) throw new Error("expected the journal to replay");
  return attemptsFor("demo", "a", replayed.value, now, () => status)[0];
}

describe("session say", () => {
  it("delivers the words to the live attempt's agent and records them as heard", async () => {
    const cwd = fixture();
    await seed(cwd, liveAttempt(now + 60_000));
    const prompted: Prompted[] = [];

    const result = await runSessionSay(
      ["demo", "a", "build on main", "--by", "Rodrigo Sasaki", "--because", "main moved"],
      { cwd, clock: clock(), runtime: paneRuntime(prompted) },
    );

    expect(result).toEqual({
      exitCode: 0,
      message: "demo/a: Rodrigo Sasaki's words reached session session-1.",
    });
    expect(prompted).toEqual([{ agent, text: "build on main" }]);
    expect(journalKinds(cwd).slice(-2)).toEqual(["person-said", "outbox-delivery-recorded"]);
    const attempt = await attemptAt(cwd, "working");
    expect(attempt?.heard).toEqual({ by: "Rodrigo Sasaki", text: "build on main", at: now });
  });

  it("persists the words before delivering them, with a stable outbox identity", async () => {
    const cwd = fixture();
    await seed(cwd, liveAttempt(now + 60_000));
    let kindsAtDelivery: readonly string[] = [];
    const runtime = paneRuntime([], () => {
      kindsAtDelivery = journalKinds(cwd);
      return Promise.resolve(ok(undefined));
    });

    await runSessionSay(["demo", "a", "go on", "--by", "Rodrigo Sasaki"], {
      cwd,
      clock: clock(),
      runtime,
    });

    expect(kindsAtDelivery.at(-1)).toBe("person-said");
    const replayed = unwrap(await readReplay(sharedJournalDirectory(cwd)));
    const said = replayed.sessions.get("session-1")?.said ?? [];
    expect(said).toHaveLength(1);
    expect(said[0]?.said.id).toMatch(/^[a-f0-9]{64}$/);
    expect(said[0]?.delivery?.id).toBe(said[0]?.said.id);
    expect(said[0]?.delivery?.state).toBe("acknowledged");
  });

  it("refuses with a sentence when the node has no live attempt, recording nothing", async () => {
    const cwd = fixture();
    await seed(cwd, liveAttempt(now - 1));
    const before = journalKinds(cwd);
    const prompted: Prompted[] = [];

    const result = await runSessionSay(["demo", "a", "go on", "--by", "Rodrigo Sasaki"], {
      cwd,
      clock: clock(),
      runtime: paneRuntime(prompted),
    });

    expect(result).toEqual({
      exitCode: 1,
      message: "demo/a: no live attempt to say it to; nothing was said or recorded.",
    });
    expect(prompted).toEqual([]);
    expect(journalKinds(cwd)).toEqual(before);
  });

  it("refuses with a sentence when the pane can't be found, recording nothing", async () => {
    const cwd = fixture();
    await seed(cwd, liveAttempt(now + 60_000));
    const before = journalKinds(cwd);

    const result = await runSessionSay(["demo", "a", "go on", "--by", "Rodrigo Sasaki"], {
      cwd,
      clock: clock(),
      runtime: paneRuntime([], undefined, true),
    });

    expect(result).toEqual({
      exitCode: 1,
      message:
        "demo/a: the pane for session session-1 can't be found (no pane reports session session-1); nothing was said or recorded.",
    });
    expect(journalKinds(cwd)).toEqual(before);
  });

  it("refuses with a sentence when --by is missing", async () => {
    const cwd = fixture();
    await seed(cwd, liveAttempt(now + 60_000));

    const result = await runSessionSay(["demo", "a", "go on"], {
      cwd,
      clock: clock(),
      runtime: paneRuntime([]),
    });

    expect(result).toEqual({
      exitCode: 1,
      message:
        "interlock session say: refuses without --by; every word put into a pane records who said it.",
    });
  });

  it("records the delivery as uncertain when the adapter fails after the intent is written, and leaves the question open saying so", async () => {
    const cwd = fixture();
    await seed(cwd, liveAttempt(now + 60_000, asked));
    const runtime = paneRuntime([], () =>
      Promise.resolve(err({ kind: "remote", code: "agent_blocked", message: "agent is blocked" })),
    );

    const result = await runSessionSay(["demo", "a", "main", "--by", "Rodrigo Sasaki"], {
      cwd,
      clock: clock(),
      runtime,
    });

    expect(result).toEqual({
      exitCode: 1,
      message:
        "demo/a: Rodrigo Sasaki's words were recorded but their delivery is uncertain (agent_blocked: agent is blocked); the question stays open.",
    });
    expect(journalKinds(cwd).slice(-2)).toEqual(["person-said", "outbox-delivery-recorded"]);
    const attempt = await attemptAt(cwd);
    expect(attempt).not.toHaveProperty("heard");
    expect(attempt?.asking).toEqual({
      asked: "Build on main or on the branch?",
      options: ["main", "branch"],
      at: "2026-11-05T03:50:00Z",
      because:
        "Rodrigo Sasaki's answer at 2026-11-05T04:00:00.000Z is not known to have reached the pane (agent_blocked: agent is blocked), so the question stays open",
    });
  });

  it("leaves the question open and unheard after a crash between the intent and its delivery", async () => {
    const cwd = fixture();
    await seed(cwd, liveAttempt(now + 60_000, asked));
    const runtime = paneRuntime([], () => Promise.reject(new Error("the process died here")));

    await expect(
      runSessionSay(["demo", "a", "main", "--by", "Rodrigo Sasaki"], {
        cwd,
        clock: clock(),
        runtime,
      }),
    ).rejects.toThrow("the process died here");

    expect(journalKinds(cwd).at(-1)).toBe("person-said");
    const attempt = await attemptAt(cwd);
    expect(attempt).not.toHaveProperty("heard");
    expect(attempt?.asking).toEqual({
      asked: "Build on main or on the branch?",
      options: ["main", "branch"],
      at: "2026-11-05T03:50:00Z",
      because:
        "Rodrigo Sasaki's answer at 2026-11-05T04:00:00.000Z is not known to have reached the pane (no delivery was recorded after the words were), so the question stays open",
    });
  });

  it("closes the question it answers once the delivery is acknowledged, naming it on the record", async () => {
    const cwd = fixture();
    await seed(cwd, liveAttempt(now + 60_000, asked));

    const result = await runSessionSay(["demo", "a", "main", "--by", "Rodrigo Sasaki"], {
      cwd,
      clock: clock(),
      runtime: paneRuntime([]),
    });

    expect(result).toEqual({
      exitCode: 0,
      message:
        "demo/a: Rodrigo Sasaki's words reached session session-1, answering its question at 2026-11-05T03:50:00Z.",
    });
    const replayed = unwrap(await readReplay(sharedJournalDirectory(cwd)));
    expect(replayed.sessions.get("session-1")?.said[0]?.said.answers).toEqual({
      at: question.at,
      asked: question.asked,
    });
    const attempt = await attemptAt(cwd);
    expect(attempt?.heard).toEqual({ by: "Rodrigo Sasaki", text: "main", at: now });
    expect(attempt?.asking).toEqual({
      asked: null,
      because:
        "the session is blocked, and its last question, at 2026-11-05T03:50:00Z, was answered by Rodrigo Sasaki at 2026-11-05T04:00:00.000Z",
      at: "2026-11-05T04:00:00.000Z",
    });
  });

  it("does not close a question asked after the words were heard", async () => {
    const cwd = fixture();
    await seed(cwd, liveAttempt(now + 60_000));
    await runSessionSay(["demo", "a", "start with the ledger", "--by", "Rodrigo Sasaki"], {
      cwd,
      clock: clock(),
      runtime: paneRuntime([]),
    });
    await seed(cwd, [asked]);

    const attempt = await attemptAt(cwd);
    expect(attempt?.heard?.text).toBe("start with the ledger");
    expect(attempt?.asking).toEqual({
      asked: "Build on main or on the branch?",
      options: ["main", "branch"],
      at: "2026-11-05T03:50:00Z",
    });
  });

  it("replays a said and its delivery from the journal to the same heard and closed question", async () => {
    const cwd = fixture();
    await seed(cwd, liveAttempt(now + 60_000, asked));
    await runSessionSay(["demo", "a", "main", "--by", "Rodrigo Sasaki"], {
      cwd,
      clock: clock(),
      runtime: paneRuntime([]),
    });
    const first = await attemptAt(cwd);

    const reopened = unwrap(
      await createLedger({ clock: clock(), directory: sharedJournalDirectory(cwd) }),
    );
    const projection = reopened.projection();
    await reopened.close();

    expect(attemptsFor("demo", "a", projection, now, () => "blocked")[0]).toEqual(first);
    expect(first?.asking?.asked).toBeNull();
  });
});

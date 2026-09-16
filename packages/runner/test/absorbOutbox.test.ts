import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { isErr, unwrap } from "@phyxiusjs/fp";
import { debriefFilePath, readDebriefFile } from "debrief";
import { createLedger, readOutboxArtifact, readRawEvents } from "ledger";
import { httpClient } from "substrate";
import { verifyDebrief } from "verifier";
import { afterEach, describe, expect, it, vi } from "vitest";
import { judgeGates } from "../src/gateJudge.ts";
import { commitAll, gitInitFixtureWithContent, headSha } from "./support/gitFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
  vi.unstubAllGlobals();
});

function fixture(): string {
  directory = mkdtempSync(join(runsRoot, "absorb-"));
  writeFileSync(join(directory, "content.txt"), "content\n");
  gitInitFixtureWithContent(directory);
  return directory;
}

function writeDebrief(root: string, sessionStartSha: string, headSha: string, claim: string): void {
  const session = join(root, ".interlock", "sessions", "fixture", "n1");
  mkdirSync(session, { recursive: true });
  writeFileSync(
    join(session, "debrief.yaml"),
    `interlock: debrief@v2\ngraph: fixture\nnode: n1\nrole: worker\ngraph_base_sha: "${sessionStartSha}"\nsession_start_sha: "${sessionStartSha}"\nhead_sha: "${headSha}"\nderivation:\n  kind: agent\n  runtime: test\n  model: test\ndiscoveries: []\ndecisions:\n  - id: rejected-claim\n    what: ${claim}\n    because: the proof must retain command evidence\n    rests_on: []\n    hunks: ["content.txt:99"]\ngates_run_by_agent: []\nopen: []\n`,
  );
  writeFileSync(join(session, "notes.yaml"), "interlock: notes@v0\nnode: n1\nentries: []\n");
}

async function judgeRejectedClaim(verifierOutcome: "unrooted" | "refused"): Promise<void> {
  const root = fixture();
  writeFileSync(join(root, "AGENTS.md"), "## Vocabulary\n\n| term | means |\n| --- | --- |\n");
  const start = headSha(root);
  writeFileSync(join(root, "content.txt"), "changed content\n");
  commitAll(root, "change content");
  const end = headSha(root);
  const claim = `${verifierOutcome} authored claim`;
  const sessionStartSha = verifierOutcome === "unrooted" ? start : end;
  const debriefHeadSha = verifierOutcome === "unrooted" ? end : start;
  writeDebrief(root, sessionStartSha, debriefHeadSha, claim);

  expect(readFileSync(debriefFilePath(root, "fixture", "n1"), "utf-8")).toContain(`what: ${claim}`);
  const debriefRead = await readDebriefFile(debriefFilePath(root, "fixture", "n1"));
  if (isErr(debriefRead) || debriefRead.value.kind !== "v2") {
    throw new Error("expected the authored v2 debrief");
  }
  const verified = await verifyDebrief(root, debriefRead.value.debrief);
  if (verifierOutcome === "unrooted") {
    if (isErr(verified)) throw new Error("expected a valid historical range");
    expect(verified.value.decisionMarks).toEqual([
      expect.objectContaining({
        decision: expect.objectContaining({ id: "rejected-claim" }),
        marks: [expect.objectContaining({ kind: "unrooted" })],
      }),
    ]);
  } else {
    expect(isErr(verified)).toBe(true);
    if (!isErr(verified)) throw new Error("expected a refused historical range");
    expect(verified.error).toEqual({
      kind: "range-not-in-history",
      sessionStartSha,
      headSha: debriefHeadSha,
    });
  }

  const ledger = unwrap(
    await createLedger({
      clock: createControlledClock({ initialTime: 0 }),
      directory: join(root, "journal"),
    }),
  );
  let received = "";
  vi.stubGlobal("fetch", async (_input: string | URL | Request, init: RequestInit | undefined) => {
    const events = unwrap(await readRawEvents(ledger.directory()));
    const intent = events.find((event) => event.kind === "outbox-intent-recorded");
    expect(intent).toBeDefined();
    if (intent === undefined || !("effect" in intent))
      throw new Error("missing typed outbox intent");
    const retained = unwrap(readOutboxArtifact(ledger.directory(), intent.effect.request));
    received = typeof init?.body === "string" ? init.body : "";
    expect(retained.toString("utf-8")).toBe(received);
    return new Response(JSON.stringify({ decisions_absorbed: [], discoveries: [], gaps: [] }), {
      status: 200,
    });
  });
  const client = httpClient("https://receiver.example", undefined, {
    owner: "owner",
    name: "repository",
    originUrl: "https://example.test/owner/repository.git",
  });
  const narrated: string[] = [];

  const judged = await judgeGates({
    ledger,
    clock: createControlledClock({ initialTime: 0 }),
    node: { graph: "fixture", id: "n1" },
    session: "session-1",
    declaredGateIds: ["proof"],
    commandFor: new Map([
      ["proof", { kind: "command", run: `${process.execPath} -e process.exit(0)` }],
    ]),
    worktree: root,
    scopeRoot: root,
    scopePaths: ["content.txt"],
    commitSha: end,
    runnerId: "runner-1",
    holdMs: 60_000,
    substrate: client,
    narrate: (line) => narrated.push(line),
  });

  expect(judged).toEqual(expect.objectContaining({ _tag: "Ok" }));
  if (judged._tag === "Ok") expect(judged.value.kind).toBe("cleared");
  expect(narrated).toContain(
    "absorb https://receiver.example: translated request supplied: 1 item(s), 0 gap(s); receiver response: 0 decision ID(s), discoveries 0 known/0 new/0 unplaced, 0 gap(s); textual Context slice reference comparison: unavailable",
  );
  expect(received).not.toBe("");
  expect(JSON.parse(received)).toEqual(
    expect.objectContaining({
      debrief: expect.objectContaining({
        decisions: [expect.objectContaining({ id: "rejected-claim", what: claim })],
      }),
      items: [
        expect.objectContaining({
          kind: "discipline",
          statement: "gate proof satisfied",
          standing: "observed",
        }),
      ],
    }),
  );
  expect(JSON.parse(received).items).not.toContainEqual(
    expect.objectContaining({ statement: claim }),
  );
  const effect = [...ledger.projection().outbox.values()][0];
  if (effect?.delivery?.state !== "acknowledged") throw new Error("missing acknowledgment");
  expect(
    readFileSync(join(ledger.directory(), effect.delivery.acknowledgment.ref)).byteLength,
  ).toBeGreaterThan(0);
}

describe("absorb outbox", () => {
  it("retains observed command evidence when an authored claim is unrooted", async () => {
    await judgeRejectedClaim("unrooted");
  });

  it("retains observed command evidence when an authored claim has a refused historical range", async () => {
    await judgeRejectedClaim("refused");
  });
});

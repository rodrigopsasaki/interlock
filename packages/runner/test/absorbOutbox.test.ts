import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { unwrap } from "@phyxiusjs/fp";
import { debriefFilePath, readDebriefFile } from "debrief";
import { createLedger, readOutboxArtifact, readRawEvents } from "ledger";
import { httpClient } from "substrate";
import { afterEach, describe, expect, it, vi } from "vitest";
import { judgeGates } from "../src/gateJudge.ts";
import { gitInitFixtureWithContent } from "./support/gitFixture.ts";

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

function writeDebrief(root: string): void {
  const session = join(root, ".interlock", "sessions", "fixture", "n1");
  mkdirSync(session, { recursive: true });
  writeFileSync(
    join(session, "debrief.yaml"),
    `interlock: debrief@v2\ngraph: fixture\nnode: n1\nrole: worker\ngraph_base_sha: "0000000000000000000000000000000000000000"\nsession_start_sha: "0000000000000000000000000000000000000000"\nhead_sha: "0000000000000000000000000000000000000000"\nderivation:\n  kind: agent\n  runtime: test\n  model: test\ndiscoveries: []\ndecisions: []\ngates_run_by_agent: []\nopen: []\n`,
  );
  writeFileSync(join(session, "notes.yaml"), "interlock: notes@v0\nnode: n1\nentries: []\n");
}

describe("absorb outbox", () => {
  it("persists the exact request before the adapter receives it and retains validated acknowledgment evidence", async () => {
    const root = fixture();
    writeDebrief(root);
    expect(await readDebriefFile(debriefFilePath(root, "fixture", "n1"))).toEqual(
      expect.objectContaining({ _tag: "Ok", value: expect.objectContaining({ kind: "v2" }) }),
    );
    const ledger = unwrap(
      await createLedger({
        clock: createControlledClock({ initialTime: 0 }),
        directory: join(root, "journal"),
      }),
    );
    let received = "";
    vi.stubGlobal(
      "fetch",
      async (_input: string | URL | Request, init: RequestInit | undefined) => {
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
      },
    );
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
      commitSha: "deadbeef",
      runnerId: "runner-1",
      holdMs: 60_000,
      substrate: client,
      narrate: (line) => narrated.push(line),
    });

    expect(judged).toEqual(expect.objectContaining({ _tag: "Ok" }));
    if (judged._tag === "Ok") expect(judged.value.kind).toBe("cleared");
    expect(narrated).not.toEqual([]);
    expect(received).not.toBe("");
    const effect = [...ledger.projection().outbox.values()][0];
    if (effect?.delivery?.state !== "acknowledged") throw new Error("missing acknowledgment");
    expect(
      readFileSync(join(ledger.directory(), effect.delivery.acknowledgment.ref)).byteLength,
    ).toBeGreaterThan(0);
  });
});

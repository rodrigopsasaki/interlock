import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { unwrap } from "@phyxiusjs/fp";
import { createLedger } from "ledger";
import type { SubstrateClient } from "substrate";
import { afterEach, describe, expect, it } from "vitest";
import { judgeGates } from "../src/gateJudge.ts";
import { gitInitFixtureWithContent } from "./support/gitFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });
let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function fixture(): string {
  directory = mkdtempSync(join(runsRoot, "absorb-failure-"));
  writeFileSync(join(directory, "content.txt"), "content\n");
  gitInitFixtureWithContent(directory);
  const session = join(directory, ".interlock", "sessions", "fixture", "n1");
  mkdirSync(session, { recursive: true });
  writeFileSync(
    join(session, "debrief.yaml"),
    'interlock: debrief@v2\ngraph: fixture\nnode: n1\nrole: worker\ngraph_base_sha: "0000000000000000000000000000000000000000"\nsession_start_sha: "0000000000000000000000000000000000000000"\nhead_sha: "0000000000000000000000000000000000000000"\nderivation:\n  kind: agent\n  runtime: test\n  model: test\ndiscoveries: []\ndecisions: []\ngates_run_by_agent: []\nopen: []\n',
  );
  writeFileSync(join(session, "notes.yaml"), "interlock: notes@v0\nnode: n1\nentries: []\n");
  return directory;
}

function preparedClient(
  dispatches: { count: number },
  response: "uncertain" | "acknowledged",
): SubstrateClient {
  return {
    address: "https://receiver.example",
    capabilities: () => Promise.resolve([]),
    context: () => Promise.resolve({ kind: "empty" }),
    absorb: () => Promise.resolve({ kind: "empty" }),
    prepareAbsorb: () =>
      Promise.resolve({
        kind: "ready",
        target: "https://receiver.example/substrate@v1/absorb",
        request: "{}",
      }),
    dispatchAbsorb: () => {
      dispatches.count += 1;
      return Promise.resolve(
        response === "uncertain"
          ? { kind: "uncertain", because: "transport did not confirm a response" }
          : {
              kind: "acknowledged",
              outcome: { kind: "acknowledged", decisionsAbsorbed: [], discoveries: [], gaps: [] },
              response: Buffer.from("{}"),
            },
      );
    },
  };
}

async function judge(root: string, substrate: SubstrateClient) {
  const ledger = unwrap(
    await createLedger({
      clock: createControlledClock({ initialTime: 0 }),
      directory: join(root, "journal"),
    }),
  );
  await judgeGates({
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
    runnerId: "runner",
    holdMs: 60_000,
    substrate,
    narrate: () => {},
  });
  return ledger;
}

describe("absorb outbox failure proof", () => {
  it("records transport doubt and suppresses a second dispatch for the same logical identity", async () => {
    const root = fixture();
    const dispatches = { count: 0 };
    const ledger = await judge(root, preparedClient(dispatches, "uncertain"));
    expect(dispatches.count).toBe(1);
    expect([...ledger.projection().outbox.values()][0]?.state).toBe("uncertain");
    await judgeGates({
      ledger,
      clock: createControlledClock({ initialTime: 0 }),
      node: { graph: "fixture", id: "n1" },
      session: "session-1",
      declaredGateIds: [],
      commandFor: new Map(),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "runner",
      holdMs: 60_000,
      substrate: preparedClient(dispatches, "acknowledged"),
      narrate: () => {},
    });
    expect(dispatches.count).toBe(1);
  });

  it("refuses a client without preparation before creating an effect or dispatching", async () => {
    const root = fixture();
    const ledger = unwrap(
      await createLedger({
        clock: createControlledClock({ initialTime: 0 }),
        directory: join(root, "journal"),
      }),
    );
    await judgeGates({
      ledger,
      clock: createControlledClock({ initialTime: 0 }),
      node: { graph: "fixture", id: "n1" },
      session: "session-1",
      declaredGateIds: [],
      commandFor: new Map(),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "runner",
      holdMs: 60_000,
      substrate: {
        address: "https://receiver.example",
        capabilities: () => Promise.resolve([]),
        context: () => Promise.resolve({ kind: "empty" }),
        absorb: () => Promise.resolve({ kind: "empty" }),
      },
      narrate: () => {},
    });
    expect(ledger.projection().outbox.size).toBe(0);
  });
});

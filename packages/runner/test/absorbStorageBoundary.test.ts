import {
  closeSync,
  fsyncSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { unwrap } from "@phyxiusjs/fp";
import { createLedger, createLedgerSink, type LedgerFileOperations } from "ledger";
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
  directory = mkdtempSync(join(runsRoot, "absorb-storage-"));
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

function intentFailureOperations(stage: "write" | "fsync"): LedgerFileOperations {
  let writingIntent = false;
  return {
    mkdir(path) {
      mkdirSync(path, { recursive: true });
    },
    open(path) {
      return openSync(path, "a");
    },
    write(descriptor, content) {
      writingIntent = content.includes('"kind":"outbox-intent-recorded"');
      if (writingIntent && stage === "write") throw new Error("intent write failed");
      writeFileSync(descriptor, content);
    },
    sync(descriptor) {
      if (writingIntent && stage === "fsync") throw new Error("intent fsync failed");
      fsyncSync(descriptor);
    },
    close(descriptor) {
      closeSync(descriptor);
    },
  };
}

function preparedClient(dispatches: { count: number }): SubstrateClient {
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
      return Promise.resolve({
        kind: "acknowledged",
        outcome: { kind: "acknowledged", decisionsAbsorbed: [], discoveries: [], gaps: [] },
        response: Buffer.from("{}"),
      });
    },
  };
}

describe("storage before absorb dispatch", () => {
  it.each(["write", "fsync"] as const)(
    "does not dispatch when the outbox intent %s cannot be confirmed",
    async (stage) => {
      const root = fixture();
      const ledger = unwrap(
        await createLedger({
          clock: createControlledClock({ initialTime: 0 }),
          directory: join(root, "journal"),
          sink: createLedgerSink(join(root, "journal"), intentFailureOperations(stage)),
        }),
      );
      const dispatches = { count: 0 };

      await expect(
        judgeGates({
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
          substrate: preparedClient(dispatches),
          narrate: () => {},
        }),
      ).rejects.toThrow(`intent ${stage} failed`);

      expect(dispatches.count).toBe(0);
      expect(ledger.projection().outbox.size).toBe(0);
    },
  );
});

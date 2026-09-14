import {
  closeSync,
  fsyncSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { unwrap } from "@phyxiusjs/fp";
import { debriefFilePath, notesFilePath, readDebriefFile, readNotesFile } from "debrief";
import {
  createLedger,
  createLedgerSink,
  createReceipt,
  derivation,
  duration,
  type Ledger,
  type LedgerFileOperations,
  spend,
} from "ledger";
import { httpClient, noneClient, type SubstrateClient } from "substrate";
import { afterEach, describe, expect, it, vi } from "vitest";
import { judgeGates } from "../src/gateJudge.ts";
import { gitInitFixtureWithContent } from "./support/gitFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });
let directory: string | undefined;
const evidenceConditions: readonly ("missing" | "corrupt")[] = ["missing", "corrupt"];
const deliveryFailureStages: readonly ("write" | "fsync")[] = ["write", "fsync"];

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
  vi.unstubAllGlobals();
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

function preparedRequestClient(dispatches: { count: number }, request: string): SubstrateClient {
  return {
    address: "https://receiver.example",
    capabilities: () => Promise.resolve([]),
    context: () => Promise.resolve({ kind: "empty" }),
    absorb: () => Promise.resolve({ kind: "empty" }),
    prepareAbsorb: () =>
      Promise.resolve({
        kind: "ready",
        target: "https://receiver.example/substrate@v1/absorb",
        request,
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

async function judge(root: string, substrate: SubstrateClient) {
  const ledger = unwrap(
    await createLedger({
      clock: createControlledClock({ initialTime: 0 }),
      directory: join(root, "journal"),
    }),
  );
  await judgeWithLedger(root, ledger, substrate);
  return ledger;
}

async function judgeWithLedger(
  root: string,
  ledger: Ledger,
  substrate: SubstrateClient,
  declaredGateIds: readonly string[] = ["proof"],
  narrate: (line: string) => void = () => {},
  session = "session-1",
) {
  const commandFor = new Map<string, { readonly kind: "command"; readonly run: string }>();
  for (const id of declaredGateIds) {
    commandFor.set(id, { kind: "command", run: `${process.execPath} -e process.exit(0)` });
  }
  await judgeGates({
    ledger,
    clock: createControlledClock({ initialTime: 0 }),
    node: { graph: "fixture", id: "n1" },
    session,
    declaredGateIds,
    commandFor,
    worktree: root,
    scopeRoot: root,
    scopePaths: ["content.txt"],
    commitSha: "deadbeef",
    runnerId: "runner",
    holdMs: 60_000,
    substrate,
    narrate,
  });
}

function deliveryFailureOperations(stage: "write" | "fsync"): LedgerFileOperations {
  let writingDelivery = false;
  return {
    mkdir(path) {
      mkdirSync(path, { recursive: true });
    },
    open(path) {
      return openSync(path, "a");
    },
    write(descriptor, content) {
      writingDelivery = content.includes('"kind":"outbox-delivery-recorded"');
      if (writingDelivery && stage === "write") throw new Error("delivery write failed");
      writeFileSync(descriptor, content);
    },
    sync(descriptor) {
      if (writingDelivery && stage === "fsync") throw new Error("delivery fsync failed");
      fsyncSync(descriptor);
    },
    close(descriptor) {
      closeSync(descriptor);
    },
  };
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

  it("keeps the live read uncertain when an observed response cannot retain acknowledgment evidence", async () => {
    const root = fixture();
    const dispatches = { count: 0 };
    const ledger = unwrap(
      await createLedger({
        clock: createControlledClock({ initialTime: 0 }),
        directory: join(root, "journal"),
      }),
    );
    const client = preparedClient(dispatches, "acknowledged");
    const dispatch = client.dispatchAbsorb;
    if (dispatch === undefined) throw new Error("missing dispatch adapter");
    const blockedAcknowledgmentClient: SubstrateClient = {
      ...client,
      dispatchAbsorb: async (prepared) => {
        writeFileSync(join(ledger.directory(), "outbox", "acknowledgment"), "blocked");
        return dispatch(prepared);
      },
    };

    await judgeWithLedger(root, ledger, blockedAcknowledgmentClient);

    expect(dispatches.count).toBe(1);
    expect([...ledger.projection().outbox.values()][0]?.state).toBe("uncertain");
    await ledger.close();
    const reopened = unwrap(
      await createLedger({
        clock: createControlledClock({ initialTime: 0 }),
        directory: join(root, "journal"),
      }),
    );
    const recovered = [...reopened.projection().outbox.values()][0];
    if (recovered === undefined) throw new Error("missing recovered intent");
    const recoveredEvidence = reopened.readOutboxEvidence(
      { graph: "fixture", id: "n1" },
      "session-1",
      recovered.intent.id,
    );
    expect(recoveredEvidence).toMatchObject({
      kind: "verified",
      delivery: { state: "uncertain" },
      acknowledgment: undefined,
    });
    await judgeWithLedger(root, reopened, preparedClient(dispatches, "acknowledged"));
    expect(dispatches.count).toBe(1);
  });

  it.each(evidenceConditions)(
    "suppresses redispatch without claiming an acknowledged delivery when retained evidence is %s",
    async (condition) => {
      const root = fixture();
      const dispatches = { count: 0 };
      const ledger = unwrap(
        await createLedger({
          clock: createControlledClock({ initialTime: 0 }),
          directory: join(root, "journal"),
        }),
      );
      await judgeWithLedger(root, ledger, preparedClient(dispatches, "acknowledged"), []);
      const effect = [...ledger.projection().outbox.values()][0];
      if (effect?.delivery?.state !== "acknowledged") throw new Error("missing acknowledgment");
      const acknowledgment = join(ledger.directory(), effect.delivery.acknowledgment.ref);
      if (condition === "missing") unlinkSync(acknowledgment);
      else writeFileSync(acknowledgment, "not json");
      await ledger.close();
      const reopened = unwrap(
        await createLedger({
          clock: createControlledClock({ initialTime: 0 }),
          directory: join(root, "journal"),
        }),
      );

      const narrated: string[] = [];
      await judgeWithLedger(
        root,
        reopened,
        preparedClient(dispatches, "acknowledged"),
        [],
        (line) => narrated.push(line),
      );

      expect(dispatches.count).toBe(1);
      expect(narrated.join("\n")).toContain("outbox delivery evidence is unavailable or corrupt");
      expect(narrated.join("\n")).not.toContain("already acknowledged");
    },
  );

  it.each(deliveryFailureStages)(
    "keeps a response observed through a delivery %s failure uncertain until real-ledger reopen verifies it",
    async (stage) => {
      const root = fixture();
      const dispatches = { count: 0 };
      const calls = { count: 0 };
      if (stage === "fsync") {
        vi.stubGlobal("fetch", async () => {
          calls.count += 1;
          return new Response(
            JSON.stringify({ decisions_absorbed: [], discoveries: [], gaps: [] }),
            { status: 200 },
          );
        });
      }
      const ledger = unwrap(
        await createLedger({
          clock: createControlledClock({ initialTime: 0 }),
          directory: join(root, "journal"),
          sink: createLedgerSink(join(root, "journal"), deliveryFailureOperations(stage)),
        }),
      );
      const substrate =
        stage === "fsync"
          ? httpClient("https://receiver.example", undefined, {
              owner: "owner",
              name: "repository",
              originUrl: "https://example.test/owner/repository.git",
            })
          : preparedClient(dispatches, "acknowledged");

      await expect(judgeWithLedger(root, ledger, substrate)).rejects.toThrow(
        `delivery ${stage} failed`,
      );
      expect(stage === "fsync" ? calls.count : dispatches.count).toBe(1);
      expect([...ledger.projection().outbox.values()][0]?.state).toBe("uncertain");
      await ledger.close();

      const reopened = unwrap(
        await createLedger({
          clock: createControlledClock({ initialTime: 0 }),
          directory: join(root, "journal"),
        }),
      );
      const recovered = [...reopened.projection().outbox.values()][0];
      if (recovered === undefined) throw new Error("missing recovered intent");
      const recoveredEvidence = reopened.readOutboxEvidence(
        { graph: "fixture", id: "n1" },
        "session-1",
        recovered.intent.id,
      );
      if (recoveredEvidence.kind !== "verified") throw new Error("missing recovered evidence");
      if (stage === "write") {
        expect(recovered.state).toBe("uncertain");
        expect(recoveredEvidence.delivery).toBeUndefined();
        expect(recoveredEvidence.acknowledgment).toBeUndefined();
      } else {
        expect(recovered.state).toBe("acknowledged");
        expect(recoveredEvidence.delivery?.state).toBe("acknowledged");
        expect(recoveredEvidence.acknowledgment).toEqual(
          Buffer.from(JSON.stringify({ decisions_absorbed: [], discoveries: [], gaps: [] })),
        );
      }
      const narrated: string[] = [];
      await judgeWithLedger(root, reopened, substrate, ["proof"], (line) => narrated.push(line));

      expect(stage === "fsync" ? calls.count : dispatches.count).toBe(1);
      if (stage === "write") {
        expect(narrated.join("\n")).toContain("outbox delivery is uncertain");
      } else {
        expect(narrated.join("\n")).toContain("outbox delivery is already acknowledged");
      }
    },
  );

  it("refuses real HTTP-prepared receipt duration changes while preserving identity, and gives a new session a new identity", async () => {
    const root = fixture();
    const debriefRead = await readDebriefFile(debriefFilePath(root, "fixture", "n1"));
    const notesRead = await readNotesFile(notesFilePath(root, "fixture", "n1"));
    if (debriefRead._tag === "Err" || debriefRead.value.kind !== "v2") {
      throw new Error("missing fixture debrief");
    }
    if (notesRead._tag === "Err") throw new Error("missing fixture notes");
    const firstReceipt = unwrap(
      await createReceipt(
        root,
        ["content.txt"],
        "proof",
        "deadbeef",
        spend.none(),
        duration.measured(10),
        derivation.gate("proof", "runner@0", "runner"),
        {},
      ),
    );
    const laterReceipt = unwrap(
      await createReceipt(
        root,
        ["content.txt"],
        "proof",
        "deadbeef",
        spend.none(),
        duration.measured(20),
        derivation.gate("proof", "runner@0", "runner"),
        {},
      ),
    );
    const client = httpClient("https://receiver.example");
    const prepare = client.prepareAbsorb;
    if (prepare === undefined) throw new Error("missing HTTP preparation");
    const firstPrepared = await prepare(
      { graph: "fixture", id: "n1" },
      debriefRead.value.debrief,
      notesRead.value,
      [firstReceipt],
    );
    const laterPrepared = await prepare(
      { graph: "fixture", id: "n1" },
      debriefRead.value.debrief,
      notesRead.value,
      [laterReceipt],
    );
    if (firstPrepared.kind !== "ready" || laterPrepared.kind !== "ready") {
      throw new Error("expected prepared HTTP requests");
    }
    expect(firstPrepared.request).toContain('"duration":{"kind":"measured","ms":10}');
    expect(laterPrepared.request).toContain('"duration":{"kind":"measured","ms":20}');
    expect(laterPrepared.request).not.toBe(firstPrepared.request);

    const ledger = unwrap(
      await createLedger({
        clock: createControlledClock({ initialTime: 0 }),
        directory: join(root, "journal"),
      }),
    );
    const dispatches = { count: 0 };
    await judgeWithLedger(
      root,
      ledger,
      preparedRequestClient(dispatches, firstPrepared.request),
      [],
    );
    const original = [...ledger.projection().outbox.values()][0];
    if (original === undefined) throw new Error("missing original intent");
    const originalEvidence = ledger.readOutboxEvidence(
      { graph: "fixture", id: "n1" },
      "session-1",
      original.intent.id,
    );
    if (originalEvidence.kind !== "verified") throw new Error("missing original evidence");

    const narrated: string[] = [];
    await judgeWithLedger(
      root,
      ledger,
      preparedRequestClient(dispatches, laterPrepared.request),
      [],
      (line) => narrated.push(line),
    );
    const unchanged = ledger.readOutboxEvidence(
      { graph: "fixture", id: "n1" },
      "session-1",
      original.intent.id,
    );

    expect(dispatches.count).toBe(1);
    expect(narrated.join("\n")).toContain("outbox intent conflicts with its retained request");
    expect(unchanged).toMatchObject({ kind: "verified", request: originalEvidence.request });
    await judgeWithLedger(
      root,
      ledger,
      preparedRequestClient(dispatches, firstPrepared.request),
      [],
      () => {},
      "session-2",
    );
    expect(dispatches.count).toBe(2);
    expect(ledger.projection().outbox.size).toBe(2);
  });

  it("records useful redacted non-2xx detail from the actual HTTP adapter as uncertainty", async () => {
    const root = fixture();
    const token = "private-token";
    const keyFile = join(root, "key.txt");
    writeFileSync(keyFile, `${token}\n`);
    const calls = { count: 0 };
    vi.stubGlobal("fetch", async () => {
      calls.count += 1;
      return new Response(JSON.stringify({ error: `receiver rejected ${token}` }), {
        status: 409,
        headers: { "content-type": "application/json" },
      });
    });
    const ledger = unwrap(
      await createLedger({
        clock: createControlledClock({ initialTime: 0 }),
        directory: join(root, "journal"),
      }),
    );
    const narrated: string[] = [];
    await judgeWithLedger(
      root,
      ledger,
      httpClient("https://receiver.example", keyFile),
      ["proof"],
      (line) => narrated.push(line),
    );

    expect(calls.count).toBe(1);
    expect([...ledger.projection().outbox.values()][0]?.state).toBe("uncertain");
    expect(narrated.join("\n")).toContain("HTTP 409: receiver rejected [redacted]");
    expect(narrated.join("\n")).not.toContain(token);
  });

  it.each([
    ["a malformed response", () => new Response("{", { status: 200 })],
    ["a schema-invalid response", () => new Response("{}", { status: 200 })],
    ["a transport failure", () => Promise.reject(new Error("network stopped"))],
  ])("records %s from the actual HTTP adapter as uncertainty", async (_name, response) => {
    const root = fixture();
    const calls = { count: 0 };
    vi.stubGlobal("fetch", async () => {
      calls.count += 1;
      return response();
    });
    const ledger = await judge(
      root,
      httpClient("https://receiver.example", undefined, {
        owner: "owner",
        name: "repository",
        originUrl: "https://example.test/owner/repository.git",
      }),
    );

    expect(calls.count).toBe(1);
    expect([...ledger.projection().outbox.values()][0]?.state).toBe("uncertain");
  });

  it.each([
    "none",
    "https://user:secret@receiver.example",
    "https://receiver.example?token=secret",
    "https://receiver.example#fragment",
  ])("does not create an effect or call the adapter for unsafe target %s", async (address) => {
    const root = fixture();
    const calls = { count: 0 };
    vi.stubGlobal("fetch", async () => {
      calls.count += 1;
      return new Response("{}", { status: 200 });
    });
    const ledger = await judge(root, address === "none" ? noneClient() : httpClient(address));

    expect(ledger.projection().outbox.size).toBe(0);
    expect(calls.count).toBe(0);
  });
});

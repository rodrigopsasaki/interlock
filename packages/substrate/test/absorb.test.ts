import { afterEach, describe, expect, it } from "vitest";
import { substrateClientFor } from "../src/address.ts";
import { narrateAbsorb } from "../src/narrate.ts";
import {
  startFakeSubstrateServer,
  type FakeSubstrateServer,
} from "./support/fakeSubstrateServer.ts";
import {
  fixtureDebrief,
  fixtureNotes,
  fixtureReceipt,
} from "./support/fixtures.ts";

const node = { graph: "0003-translator", id: "substrate-client" };

let server: FakeSubstrateServer | undefined;

afterEach(async () => {
  if (server !== undefined) await server.close();
  server = undefined;
});

describe("absorb", () => {
  it("sends the debrief and notes in their wire shape and returns the acknowledgement's counts", async () => {
    server = await startFakeSubstrateServer();
    server.responseFor("absorb", {
      decisions_absorbed: ["c1"],
      discoveries: [{ id: "d1", placement: "new" }],
      gaps: [],
    });

    const client = substrateClientFor(server.url);
    const outcome = await client.absorb(node, fixtureDebrief, fixtureNotes, [
      fixtureReceipt,
    ]);

    expect(outcome).toEqual({
      kind: "acknowledged",
      decisionsAbsorbed: ["c1"],
      discoveries: [{ id: "d1", placement: "new" }],
      gaps: [],
    });
    expect(narrateAbsorb(server.url, outcome)).toBe(
      `absorb ${server.url}: 1 decision(s) absorbed, discoveries 0 known/1 new/0 unplaced, 0 gap(s)`,
    );

    const sent = server.calls[0]?.body;
    expect(sent).toMatchObject({
      debrief: { interlock: "debrief@v2", graph_base_sha: "a".repeat(40) },
      notes: { interlock: "notes@v0", node: "substrate-client" },
      receipts: [fixtureReceipt],
    });
  });

  it("narrates a held session's acknowledgement the same as a cleared one's", async () => {
    server = await startFakeSubstrateServer();
    server.responseFor("absorb", {
      decisions_absorbed: [],
      discoveries: [
        { id: "d1", placement: "known" },
        { id: "d2", placement: "unplaced" },
      ],
      gaps: [{ term: "hold", nearest: "gate", difference: "no verdict" }],
    });

    const client = substrateClientFor(server.url);
    const outcome = await client.absorb(node, fixtureDebrief, fixtureNotes, [
      fixtureReceipt,
    ]);

    expect(narrateAbsorb(server.url, outcome)).toBe(
      `absorb ${server.url}: 0 decision(s) absorbed, discoveries 1 known/0 new/1 unplaced, 1 gap(s)`,
    );
  });

  it("acknowledges nothing while everything still runs when the address is none", async () => {
    const client = substrateClientFor("none");
    const outcome = await client.absorb(node, fixtureDebrief, fixtureNotes, [
      fixtureReceipt,
    ]);
    expect(outcome).toEqual({ kind: "empty" });
    expect(narrateAbsorb("none", outcome)).toBe(
      "absorb none: no substrate addressed",
    );
  });

  it("refuses with a sentence, never throws, on a network error", async () => {
    const client = substrateClientFor("http://127.0.0.1:1");
    const outcome = await client.absorb(node, fixtureDebrief, fixtureNotes, [
      fixtureReceipt,
    ]);
    expect(outcome.kind).toBe("refused");
  });
});

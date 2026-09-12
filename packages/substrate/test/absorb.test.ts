import { afterEach, describe, expect, it } from "vitest";
import { substrateClientFor } from "../src/address.ts";
import { narrateAbsorb } from "../src/narrate.ts";
import {
  type FakeSubstrateServer,
  startFakeSubstrateServer,
} from "./support/fakeSubstrateServer.ts";
import { fixtureDebrief, fixtureItem, fixtureNotes, fixtureReceipt } from "./support/fixtures.ts";

function hasKey(value: unknown, key: string): boolean {
  return typeof value === "object" && value !== null && Object.hasOwn(value, key);
}

const node = { graph: "0003-translator", id: "substrate-client" };

let server: FakeSubstrateServer | undefined;

afterEach(async () => {
  if (server !== undefined) await server.close();
  server = undefined;
});

describe("absorb", () => {
  it("narrates a cleared session's absorb acknowledged with its counts", async () => {
    server = await startFakeSubstrateServer();
    server.responseFor("absorb", {
      decisions_absorbed: ["c1"],
      discoveries: [{ id: "d1", placement: "new" }],
      gaps: [],
    });

    const client = substrateClientFor(server.url);
    const outcome = await client.absorb(node, fixtureDebrief, fixtureNotes, [fixtureReceipt]);

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

  it("narrates a held session's absorb acknowledged the same as a cleared session's", async () => {
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
    const outcome = await client.absorb(node, fixtureDebrief, fixtureNotes, [fixtureReceipt]);

    expect(narrateAbsorb(server.url, outcome)).toBe(
      `absorb ${server.url}: 0 decision(s) absorbed, discoveries 1 known/0 new/1 unplaced, 1 gap(s)`,
    );
  });

  it("acknowledges nothing while everything still runs when the address is none", async () => {
    const client = substrateClientFor("none");
    const outcome = await client.absorb(node, fixtureDebrief, fixtureNotes, [fixtureReceipt]);
    expect(outcome).toEqual({ kind: "empty" });
    expect(narrateAbsorb("none", outcome)).toBe("absorb none: no substrate addressed");
  });

  it("refuses with a sentence, never throws, on a network error", async () => {
    const client = substrateClientFor("http://127.0.0.1:1");
    const outcome = await client.absorb(node, fixtureDebrief, fixtureNotes, [fixtureReceipt]);
    expect(outcome.kind).toBe("refused");
  });

  it("degrades to a narrated refusal instead of acknowledged, judgement still able to complete, when the address stops answering mid-run", async () => {
    server = await startFakeSubstrateServer();
    server.hangOn("absorb");

    const client = substrateClientFor(server.url);
    const outcome = await client.absorb(node, fixtureDebrief, fixtureNotes, [fixtureReceipt]);

    expect(outcome.kind).toBe("refused");
    expect(narrateAbsorb(server.url, outcome)).toMatch(
      new RegExp(`^absorb ${server.url}: refused, `),
    );
  }, 8_000);

  it("counts a debrief's discoveries against the slice when the acknowledged response declares no such detail", async () => {
    server = await startFakeSubstrateServer();
    server.responseFor("absorb", {
      decisions_absorbed: [],
      discoveries: [],
      gaps: [],
    });

    const client = substrateClientFor(server.url);
    const outcome = await client.absorb(node, fixtureDebrief, fixtureNotes, [fixtureReceipt]);

    const sliceBody = [
      "### Discipline",
      "",
      "- [observed, path packages/schemas/package.json] already named as a cycle risk",
      "  derivation: human:Rodrigo Sasaki",
    ].join("\n");

    expect(
      narrateAbsorb(server.url, outcome, {
        body: sliceBody,
        discoveries: fixtureDebrief.discoveries,
      }),
    ).toBe(
      `absorb ${server.url}: 0 decision(s) absorbed, discoveries 1 known/0 unknown against the slice, 0 gap(s)`,
    );
  });

  it("says the rest is unknown when nothing in the slice names a discovery's own reference", async () => {
    server = await startFakeSubstrateServer();
    server.responseFor("absorb", {
      decisions_absorbed: [],
      discoveries: [],
      gaps: [],
    });

    const client = substrateClientFor(server.url);
    const outcome = await client.absorb(node, fixtureDebrief, fixtureNotes, [fixtureReceipt]);

    expect(
      narrateAbsorb(server.url, outcome, {
        body: "No path from this debrief is named here.",
        discoveries: fixtureDebrief.discoveries,
      }),
    ).toBe(
      `absorb ${server.url}: 0 decision(s) absorbed, discoveries 0 known/1 unknown against the slice, 0 gap(s)`,
    );
  });

  it("carries items and gaps in the request body when evidence is given", async () => {
    server = await startFakeSubstrateServer();
    server.responseFor("absorb", {
      decisions_absorbed: [],
      discoveries: [],
      gaps: [],
    });

    const client = substrateClientFor(server.url);
    await client.absorb(node, fixtureDebrief, fixtureNotes, [fixtureReceipt], {
      items: [fixtureItem],
      gaps: [
        {
          term: "step",
          nearest: "gate",
          difference: "no verdict, only legality",
        },
      ],
    });

    const sent = server.calls[0]?.body;
    expect(hasKey(sent, "items")).toBe(true);
    expect(hasKey(sent, "gaps")).toBe(true);
    expect(sent).toMatchObject({
      items: [fixtureItem],
      gaps: [
        {
          term: "step",
          nearest: "gate",
          difference: "no verdict, only legality",
        },
      ],
    });
  });

  it("omits items and gaps from the request body when no evidence is given", async () => {
    server = await startFakeSubstrateServer();
    server.responseFor("absorb", {
      decisions_absorbed: [],
      discoveries: [],
      gaps: [],
    });

    const client = substrateClientFor(server.url);
    await client.absorb(node, fixtureDebrief, fixtureNotes, [fixtureReceipt]);

    const sent = server.calls[0]?.body;
    expect(hasKey(sent, "items")).toBe(false);
    expect(hasKey(sent, "gaps")).toBe(false);
  });
});

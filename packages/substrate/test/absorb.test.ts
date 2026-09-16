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
  it("keeps the receiver response distinct from unavailable local observations", async () => {
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
      `absorb ${server.url}: translated request supplied: unavailable; receiver response: 1 decision ID(s), discoveries 0 known/1 new/0 unplaced, 0 gap(s); textual Context slice reference comparison: unavailable`,
    );

    const sent = server.calls[0]?.body;
    expect(sent).toMatchObject({
      debrief: { interlock: "debrief@v2", graph_base_sha: "a".repeat(40) },
      notes: { interlock: "notes@v0", node: "substrate-client" },
      receipts: [fixtureReceipt],
    });
  });

  it("retains receiver-reported discovery placements in the response read", async () => {
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
      `absorb ${server.url}: translated request supplied: unavailable; receiver response: 0 decision ID(s), discoveries 1 known/0 new/1 unplaced, 1 gap(s); textual Context slice reference comparison: unavailable`,
    );
  });

  it("uses the same bound repository selector for absorb", async () => {
    server = await startFakeSubstrateServer();
    server.responseFor("absorb", {
      decisions_absorbed: [],
      discoveries: [],
      gaps: [],
    });

    const client = substrateClientFor(server.url, undefined, {
      owner: "octo",
      name: "interlock",
      originUrl: "https://github.example/octo/interlock.git",
    });
    await client.absorb(node, fixtureDebrief, fixtureNotes, [fixtureReceipt]);

    expect(server.calls[0]?.body).toMatchObject({
      repository: {
        owner: "octo",
        name: "interlock",
        origin_url: "https://github.example/octo/interlock.git",
      },
    });
  });

  it("keeps one strict-receiver absorb refusal without an unscoped fallback", async () => {
    server = await startFakeSubstrateServer();
    server.responseFor("absorb", { error: "unknown repository" }, 400);
    const client = substrateClientFor(server.url, undefined, {
      owner: "octo",
      name: "interlock",
      originUrl: "https://forge.example/octo/interlock.git",
    });

    const outcome = await client.absorb(node, fixtureDebrief, fixtureNotes, [fixtureReceipt]);

    expect(outcome.kind).toBe("refused");
    expect(server.calls).toHaveLength(1);
    expect(server.calls[0]?.body).toMatchObject({ repository: { owner: "octo" } });
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
    if (outcome.kind !== "refused") return;
    expect(outcome.because).not.toContain("HTTP");
  });

  it("keeps a received absorb refusal's status and JSON error string", async () => {
    server = await startFakeSubstrateServer();
    server.responseFor("absorb", { error: "debrief conflicts with the graph" }, 409);

    const client = substrateClientFor(server.url);
    const outcome = await client.absorb(node, fixtureDebrief, fixtureNotes, [fixtureReceipt]);

    expect(outcome).toEqual({
      kind: "refused",
      because: `absorb ${server.url}: HTTP 409: debrief conflicts with the graph`,
    });
    expect(narrateAbsorb(server.url, outcome)).toBe(
      `absorb ${server.url}: refused, absorb ${server.url}: HTTP 409: debrief conflicts with the graph`,
    );
  });

  it("keeps a received absorb refusal's plain-text detail", async () => {
    server = await startFakeSubstrateServer();
    server.rawResponseFor("absorb", "receipt is too large", 413, "text/plain");

    const client = substrateClientFor(server.url);
    const outcome = await client.absorb(node, fixtureDebrief, fixtureNotes, [fixtureReceipt]);

    expect(outcome).toEqual({
      kind: "refused",
      because: `absorb ${server.url}: HTTP 413: receipt is too large`,
    });
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

  it("reports a textual Context slice reference comparison apart from the response", async () => {
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
        translation: { kind: "observed", itemCount: 1, gaps: [] },
        slice: { kind: "present", body: sliceBody, discoveries: fixtureDebrief.discoveries },
      }),
    ).toBe(
      `absorb ${server.url}: translated request supplied: 1 item(s), 0 gap(s); receiver response: 0 decision ID(s), discoveries 0 known/0 new/0 unplaced, 0 gap(s); textual Context slice reference comparison: 1 matching/0 not matching`,
    );
  });

  it("does not turn a nonmatching textual reference into a receiver placement", async () => {
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
        translation: { kind: "observed", itemCount: 0, gaps: [] },
        slice: {
          kind: "present",
          body: "No path from this debrief is named here.",
          discoveries: fixtureDebrief.discoveries,
        },
      }),
    ).toBe(
      `absorb ${server.url}: translated request supplied: 0 item(s), 0 gap(s); receiver response: 0 decision ID(s), discoveries 0 known/0 new/0 unplaced, 0 gap(s); textual Context slice reference comparison: 0 matching/1 not matching`,
    );
  });

  it("keeps observed-empty translation and an empty Context slice distinct from unavailable at the public formatter boundary", async () => {
    const outcome: {
      readonly kind: "acknowledged";
      readonly decisionsAbsorbed: readonly string[];
      readonly discoveries: readonly [];
      readonly gaps: readonly [];
    } = {
      kind: "acknowledged",
      decisionsAbsorbed: [],
      discoveries: [],
      gaps: [],
    };

    const observedEmpty = narrateAbsorb("spy", outcome, {
      translation: { kind: "observed", itemCount: 0, gaps: [] },
      slice: { kind: "present", body: "", discoveries: fixtureDebrief.discoveries },
    });
    const unavailable = narrateAbsorb("spy", outcome, {
      translation: { kind: "unavailable" },
      slice: { kind: "unavailable" },
    });

    expect(observedEmpty).toContain("translated request supplied: 0 item(s), 0 gap(s)");
    expect(observedEmpty).toContain(
      "textual Context slice reference comparison: 0 matching/1 not matching",
    );
    expect(unavailable).toContain("translated request supplied: unavailable");
    expect(unavailable).toContain("textual Context slice reference comparison: unavailable");
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

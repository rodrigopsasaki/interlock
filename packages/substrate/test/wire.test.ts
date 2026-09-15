import { describe, expect, it } from "vitest";
import { toWireDebrief, toWireNotes } from "../src/wire.ts";
import { fixtureDebrief, fixtureNotes } from "./support/fixtures.ts";

describe("wire", () => {
  it("renames the harness's camelCase debrief fields to debrief@v2's snake_case wire shape", () => {
    const wire = toWireDebrief(fixtureDebrief);
    expect(wire.interlock).toBe("debrief@v2");
    expect(wire.graph_base_sha).toBe(fixtureDebrief.graphBaseSha);
    expect(wire.session_start_sha).toBe(fixtureDebrief.sessionStartSha);
    expect(wire.head_sha).toBe(fixtureDebrief.headSha);
    expect(wire.decisions[0]).toEqual({
      id: "c1",
      what: fixtureDebrief.decisions[0]?.what,
      because: fixtureDebrief.decisions[0]?.because,
      rests_on: [],
      hunks: fixtureDebrief.decisions[0]?.hunks,
    });
    expect(wire.discoveries[0]).toEqual({
      id: "d1",
      what: fixtureDebrief.discoveries[0]?.what,
      found_at: fixtureDebrief.discoveries[0]?.foundAt,
      mattered_because: fixtureDebrief.discoveries[0]?.matteredBecause,
    });
  });

  it("wraps a session's notes with the notes@v0 envelope", () => {
    const wire = toWireNotes("substrate-client", fixtureNotes);
    expect(wire).toEqual({
      interlock: "notes@v0",
      node: "substrate-client",
      entries: fixtureNotes,
    });
  });

  it("preserves explicit applicability on debrief claims while leaving item wire fields unchanged", () => {
    const wire = toWireDebrief({
      ...fixtureDebrief,
      discoveries: [
        {
          id: "d1",
          what: "schemas depends on runner",
          foundAt: "notes.yaml",
          matteredBecause: "a naive package edge would have cycled",
          appliesTo: { kind: "repository" },
        },
      ],
      decisions: [
        {
          id: "c1",
          what: "kept the ajv registry local to this package",
          because: "schemas depends on runner, which depends on this package",
          restsOn: [],
          hunks: ["notes.yaml"],
          appliesTo: { kind: "path", path: "packages/substrate/src/evidence.ts" },
        },
      ],
    });
    expect(wire.discoveries[0]?.applies_to).toEqual({ kind: "repository" });
    expect(wire.decisions[0]?.applies_to).toEqual({
      kind: "path",
      path: "packages/substrate/src/evidence.ts",
    });
    expect(wire.decisions[0]?.hunks).toEqual(["notes.yaml"]);
  });
});

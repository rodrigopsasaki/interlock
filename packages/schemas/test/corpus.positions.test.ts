import type { GraphDocument } from "face";
import { positionOf } from "face";
import { emptyProjection } from "ledger";
import { describe, expect, it } from "vitest";
import { buildRegistry } from "../src/registry.ts";
import { judgeValue } from "../src/validate.ts";

const document: GraphDocument = {
  id: "g",
  gates: [],
  nodes: [{ id: "a", dependsOn: [], gates: [] }],
};

const position = positionOf(document, emptyProjection(), "content-hash", Date.now());

const readRepository = {
  asked: "/repo",
  state: "found",
  root: "/repo",
  origin: { state: "identified", url: "ssh://host/owner/name", owner: "owner", name: "name" },
  journal: { state: "read" },
  graphs: [
    { graph: "g", state: "read", position },
    { graph: "broken", state: "unreadable", because: "broken.yaml: invalid YAML" },
  ],
  live: [
    {
      graph: "g",
      node: "a",
      session: "s",
      role: "implementer",
      runtime: { name: "r", kind: "k", model: "m" },
      agentStatus: "working",
    },
  ],
};

describe("corpus: positions@v0", () => {
  const registry = buildRegistry();

  it("validates a read carrying a code-produced position@v1 beside an unreadable graph", () => {
    expect(
      judgeValue(registry, { interlock: "positions@v0", repositories: [readRepository] }),
    ).toEqual({ kind: "valid", tag: "positions@v0" });
  });

  it("refuses a read journal without a live list, so an empty one is never implied", () => {
    const { live: _live, ...withoutLive } = readRepository;
    expect(
      judgeValue(registry, { interlock: "positions@v0", repositories: [withoutLive] }).kind,
    ).toBe("invalid");
  });

  it("refuses a graph entry that carries neither a position nor a because", () => {
    const bare = { ...readRepository, graphs: [{ graph: "g", state: "unreadable" }] };
    expect(judgeValue(registry, { interlock: "positions@v0", repositories: [bare] }).kind).toBe(
      "invalid",
    );
  });
});

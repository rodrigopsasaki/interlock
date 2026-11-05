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

  it("validates a read carrying a code-produced position@v2 beside an unreadable graph", () => {
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

const liveV1 = {
  ...readRepository.live[0],
  pane: { state: "known", address: "w1:p3" },
  startedAt: { state: "known", epochMs: 1_700_000_000_000 },
};

function positionsV1(live: unknown): unknown {
  return { interlock: "positions@v1", repositories: [{ ...readRepository, live: [live] }] };
}

describe("corpus: positions@v1", () => {
  const registry = buildRegistry();

  it("validates a live attempt carrying a known pane and start, and one carrying both unknown", () => {
    expect(judgeValue(registry, positionsV1(liveV1))).toEqual({
      kind: "valid",
      tag: "positions@v1",
    });
    const unknown = {
      ...liveV1,
      pane: { state: "unknown", because: "the runtime lists no agent for session s" },
      startedAt: { state: "unknown", because: "no start recorded" },
    };
    expect(judgeValue(registry, positionsV1(unknown))).toEqual({
      kind: "valid",
      tag: "positions@v1",
    });
  });

  it("requires pane and startedAt on every live attempt, so a positions@v0 attempt is not a v1 one", () => {
    expect(judgeValue(registry, positionsV1(readRepository.live[0])).kind).toBe("invalid");
    const { startedAt: _startedAt, ...withoutStart } = liveV1;
    expect(judgeValue(registry, positionsV1(withoutStart)).kind).toBe("invalid");
  });

  it.each([
    ["a bare pane address", { pane: "w1:p3" }],
    ["a bare start time", { startedAt: 1_700_000_000_000 }],
    ["a known pane without its address", { pane: { state: "known" } }],
    ["a known pane with a because", { pane: { state: "known", address: "w1", because: "x" } }],
    [
      "an unknown pane with an address",
      { pane: { state: "unknown", address: "w1", because: "x" } },
    ],
    ["an unknown pane with an empty because", { pane: { state: "unknown", because: "" } }],
    ["a known start that is not a number", { startedAt: { state: "known", epochMs: "today" } }],
    ["an unknown start with a time", { startedAt: { state: "unknown", epochMs: 1, because: "x" } }],
    ["an unknown start without a because", { startedAt: { state: "unknown" } }],
  ])("refuses %s", (_name, override) => {
    expect(judgeValue(registry, positionsV1({ ...liveV1, ...override })).kind).toBe("invalid");
  });
});

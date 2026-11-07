import { type GraphDocument, positionOf } from "face";
import { envelopeFor, fold, isSessionRuntime, parseLine, sessionRuntime } from "ledger";
import { describe, expect, it } from "vitest";
import { buildRegistry, validatorFor } from "../src/registry.ts";

const registry = buildRegistry();
function valid(tag: string, value: unknown): boolean {
  const validate = validatorFor(registry, tag);
  if (validate === undefined) throw new Error(`missing schema ${tag}`);
  return validate(value) === true;
}
const headroom = {
  state: "known",
  fraction: 0.5,
  raw: 50,
  unit: "percent used",
  source: "fixture",
};
const chosenBy = {
  kind: "routed",
  because: "highest fraction",
  candidates: [{ provider: "account", headroom }],
};
const runtime = sessionRuntime.declared("profile", "fake", "m", {
  provider: "account",
  chosenBy: {
    kind: "routed",
    because: "highest fraction",
    candidates: [
      {
        provider: "account",
        headroom: {
          state: "known",
          fraction: 0.5,
          raw: 50,
          unit: "percent used",
          source: "fixture",
        },
      },
    ],
  },
});
const node = { graph: "g", id: "n" };
const session = { id: "s", node, runtime };
const event = envelopeFor({
  kind: "session-started",
  session,
  brief: { graph: "g", node: "n", role: "worker", acceptance: "x", gates: [], scope: [] },
});

describe("provider-routing shape versions", () => {
  it.each(["runtimes@v0", "runtimes@v1", "runtimes@v2"])(
    "keeps %s readable, including runner commits where published",
    (tag) => {
      expect(
        valid(tag, { interlock: tag, runtimes: { worker: { kind: "fake", model: "m" } } }),
      ).toBe(true);
      if (tag !== "runtimes@v0")
        expect(
          valid(tag, {
            interlock: tag,
            runtimes: { worker: { kind: "fake", model: "m", commits: "runner" } },
          }),
        ).toBe(true);
    },
  );
  it("v2 validates provider/routable while retaining the published commits field", () => {
    const worker = {
      kind: "fake",
      model: "m",
      commits: "runner",
      provider: "account",
      routable: true,
    };
    const catalogue = (profile: unknown) => ({
      interlock: "runtimes@v2",
      runtimes: { worker: profile },
    });
    expect(valid("runtimes@v2", catalogue(worker))).toBe(true);
    for (const invalid of [
      { ...worker, provider: "" },
      { ...worker, routable: false },
      { ...worker, provider: undefined },
      { ...worker, commits: "other" },
    ])
      expect(valid("runtimes@v2", catalogue(invalid))).toBe(false);
  });
  it.each(["local@v0", "local@v1"])("keeps %s readable with optional routing fields", (tag) => {
    const local = {
      interlock: tag,
      runtime: { kind: "fake" },
      worktree_root: ".worktrees",
      lease_ms: 10,
      run_timeout_ms: 10,
      substrate: { address: "none" },
    };
    expect(valid(tag, local)).toBe(true);
    if (tag === "local@v1") {
      expect(valid(tag, { ...local, provider_order: ["a", "b"], last_resort: "a" })).toBe(true);
      expect(valid(tag, { ...local, provider_order: ["a", "a"] })).toBe(false);
      expect(valid(tag, { ...local, last_resort: "" })).toBe(false);
    }
  });
  it("event@v10 validates and replays the full choice; every historical event version still reads without attribution", () => {
    expect(valid("event@v10", event)).toBe(true);
    expect(parseLine(JSON.stringify(event)).kind).toBe("event");
    for (let version = 6; version <= 9; version += 1) {
      const tag = `event@v${version}`;
      const historical = {
        ...event,
        interlock: tag,
        session: { ...session, runtime: { name: "profile", kind: "fake", model: "m" } },
      };
      expect(valid(tag, historical)).toBe(true);
      expect(parseLine(JSON.stringify(historical)).kind).toBe("event");
      expect(parseLine(JSON.stringify({ ...event, interlock: tag })).kind).toBe("refused");
    }
  });
  it("runtime guards and the new schema reject malformed fractions and choices", () => {
    for (const fraction of [-1, 1.1, "half"]) {
      const bad = {
        name: "p",
        kind: "fake",
        chosenBy: {
          ...chosenBy,
          candidates: [{ provider: "account", headroom: { ...headroom, fraction } }],
        },
      };
      expect(isSessionRuntime(bad)).toBe(false);
      expect(valid("event@v10", { ...event, session: { ...session, runtime: bad } })).toBe(false);
    }
    expect(isSessionRuntime({ name: "p", kind: "fake", chosenBy: { kind: "last-resort" } })).toBe(
      false,
    );
  });
  it("position@v3 and positions@v2 carry attempt attribution and preserve historical schemas", () => {
    const graph: GraphDocument = {
      id: "g",
      gates: [],
      nodes: [{ id: "n", dependsOn: [], gates: [] }],
    };
    const position = positionOf(graph, fold([event]), "hash", 0);
    expect(valid("position@v3", position)).toBe(true);
    expect(position.nodes[0]?.attempts[0]).toMatchObject({ provider: "account", chosenBy });
    expect(valid("position@v2", { ...position, interlock: "position@v2" })).toBe(false);
    const read = {
      interlock: "positions@v2",
      repositories: [
        {
          asked: "/repo",
          state: "found",
          root: "/repo",
          journal: { state: "read" },
          graphs: [{ graph: "g", state: "read", position }],
          live: [
            {
              graph: "g",
              node: "n",
              session: "s",
              runtime,
              provider: "account",
              chosenBy,
              agentStatus: "working",
              pane: { state: "unknown", because: "not observed" },
              startedAt: { state: "unknown", because: "not recorded" },
            },
          ],
        },
      ],
    };
    expect(valid("positions@v2", read)).toBe(true);
    for (const tag of ["position@v1", "position@v2"])
      expect(
        valid(tag, {
          interlock: tag,
          graph: "old",
          approval: "not-approved",
          nodes: [],
          criticalPath: [],
        }),
      ).toBe(true);
    expect(valid("positions@v1", { interlock: "positions@v1", repositories: [] })).toBe(true);
    expect(valid("positions@v0", { interlock: "positions@v0", repositories: [] })).toBe(true);
  });
});

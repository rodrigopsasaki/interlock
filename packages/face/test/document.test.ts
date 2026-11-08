import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isErr, isOk, unwrap } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import { initFixtureRepository } from "../../../test/support/gitFixture.ts";
import { explainGraphRefusal, loadGraphDocument, loadGraphDocumentText } from "../src/document.ts";
import { findRepoRoot, graphFilePath } from "../src/root.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function write(name: string, content: string): string {
  directory = directory ?? mkdtempSync(join(runsRoot, "run-"));
  const path = join(directory, name);
  writeFileSync(path, content);
  return path;
}

describe("loadGraphDocument", () => {
  it("loads a well-formed graph@v0 document", async () => {
    const path = write(
      "graph.yaml",
      [
        "interlock: graph@v0",
        "id: demo",
        "gates:",
        "  - id: approved",
        "    kind: human",
        "nodes:",
        "  - id: a",
        "    depends_on: []",
        "    gates: []",
        "  - id: b",
        "    depends_on: [a]",
        "    gates:",
        "      - id: typecheck",
        "        kind: command",
        "",
      ].join("\n"),
    );

    const result = await loadGraphDocument(path);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value).toEqual({
      id: "demo",
      gates: [{ id: "approved", kind: "human" }],
      nodes: [
        { id: "a", dependsOn: [], gates: [] },
        {
          id: "b",
          dependsOn: ["a"],
          gates: [{ id: "typecheck", kind: "command" }],
        },
      ],
    });
  });

  it("refuses a missing file, naming the path", async () => {
    directory = mkdtempSync(join(runsRoot, "run-"));
    const path = join(directory, "does-not-exist.yaml");

    const result = await loadGraphDocument(path);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.kind).toBe("missing-file");
    expect(explainGraphRefusal(result.error)).toContain(path);
  });

  it("refuses a document whose shape tag is not graph@v0, naming the tag and what was expected", async () => {
    const path = write(
      "graph.yaml",
      ["interlock: graph@v1", "id: demo", "nodes: []", ""].join("\n"),
    );

    const result = await loadGraphDocument(path);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.kind).toBe("malformed-shape");
    const message = explainGraphRefusal(result.error);
    expect(message).toContain(path);
    expect(message).toContain("graph@v1");
    expect(message).toContain("graph@v0");
  });

  it("refuses a document with no shape tag at all", async () => {
    const path = write("graph.yaml", ["id: demo", "nodes: []", ""].join("\n"));

    const result = await loadGraphDocument(path);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.kind).toBe("malformed-shape");
  });

  it("refuses a node that depends on an id no node declares", async () => {
    const path = write(
      "graph.yaml",
      [
        "interlock: graph@v0",
        "id: demo",
        "nodes:",
        "  - id: a",
        "    depends_on: [ghost]",
        "",
      ].join("\n"),
    );

    const result = await loadGraphDocument(path);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.kind).toBe("unknown-dependency");
    const message = explainGraphRefusal(result.error);
    expect(message).toContain(path);
    expect(message).toContain("a");
    expect(message).toContain("ghost");
  });

  it("refuses a dependency cycle", async () => {
    const path = write(
      "graph.yaml",
      [
        "interlock: graph@v0",
        "id: demo",
        "nodes:",
        "  - id: a",
        "    depends_on: [b]",
        "  - id: b",
        "    depends_on: [a]",
        "",
      ].join("\n"),
    );

    const result = await loadGraphDocument(path);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.kind).toBe("cycle");
    const message = explainGraphRefusal(result.error);
    expect(message).toContain(path);
    expect(message).toContain("a");
    expect(message).toContain("b");
  });

  it("defaults an absent node depends_on and gates to empty lists", async () => {
    const path = write(
      "graph.yaml",
      ["interlock: graph@v0", "id: demo", "nodes:", "  - id: a", ""].join("\n"),
    );

    const document = unwrap(await loadGraphDocument(path));
    expect(document.nodes).toEqual([{ id: "a", dependsOn: [], gates: [] }]);
    expect(document.gates).toEqual([]);
  });
});

describe("expect_output", () => {
  it("compiles a node gate's pattern into a RegExp beside its command", async () => {
    const path = write(
      "graph.yaml",
      [
        "interlock: graph@v0",
        "id: demo",
        "nodes:",
        "  - id: a",
        "    depends_on: []",
        "    gates:",
        "      - id: test",
        "        kind: command",
        "        run: pnpm test",
        "        expect_output: 'Tests +[1-9][0-9]* passed'",
        "",
      ].join("\n"),
    );

    const document = unwrap(await loadGraphDocument(path));
    const testGate = document.nodes[0]?.gates[0];
    expect(testGate?.expectOutput?.source).toBe("Tests +[1-9][0-9]* passed");
    expect(testGate?.expectOutput?.test("Tests 3 passed")).toBe(true);
    expect(testGate?.expectOutput?.test("Tests 0 passed")).toBe(false);
  });

  it("compiles a graph-level gate's pattern the same way", async () => {
    const path = write(
      "graph.yaml",
      [
        "interlock: graph@v0",
        "id: demo",
        "gates:",
        "  - id: test",
        "    kind: command",
        "    run: pnpm test",
        "    expect_output: 'ok'",
        "nodes: []",
        "",
      ].join("\n"),
    );

    const document = unwrap(await loadGraphDocument(path));
    expect(document.gates[0]?.expectOutput?.source).toBe("ok");
  });

  it("leaves expect_output undefined when the field is absent", async () => {
    const path = write(
      "graph.yaml",
      [
        "interlock: graph@v0",
        "id: demo",
        "nodes:",
        "  - id: a",
        "    depends_on: []",
        "    gates:",
        "      - id: typecheck",
        "        kind: command",
        "        run: pnpm typecheck",
        "",
      ].join("\n"),
    );

    const document = unwrap(await loadGraphDocument(path));
    expect(document.nodes[0]?.gates).toEqual([
      { id: "typecheck", kind: "command", run: "pnpm typecheck" },
    ]);
  });

  it("refuses a malformed node gate pattern with a sentence naming the node and gate", async () => {
    const path = write(
      "graph.yaml",
      [
        "interlock: graph@v0",
        "id: demo",
        "nodes:",
        "  - id: a",
        "    depends_on: []",
        "    gates:",
        "      - id: test",
        "        kind: command",
        "        run: pnpm test",
        "        expect_output: '(unclosed'",
        "",
      ].join("\n"),
    );

    const result = await loadGraphDocument(path);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.kind).toBe("malformed-shape");
    const message = explainGraphRefusal(result.error);
    expect(message).toContain('node "a"');
    expect(message).toContain('gate "test"');
    expect(message).toContain("(unclosed");
  });

  it("reads a fixture bootstrap graph and parses its expect_output criteria", async () => {
    directory = mkdtempSync(join(runsRoot, "repo-"));
    initFixtureRepository(directory, { defaultBranch: "main" });
    mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
    writeFileSync(
      join(directory, ".interlock", "graphs", "0001-bootstrap.yaml"),
      [
        "interlock: graph@v0",
        "id: 0001-bootstrap",
        "nodes:",
        "  - id: ledger",
        "    depends_on: []",
        "    gates:",
        "      - id: replay",
        "        kind: command",
        "        run: pnpm test",
        "        expect_output: 'Tests +[1-9][0-9]* passed'",
        "      - id: illegal-states",
        "        kind: command",
        "        run: pnpm test",
        "        expect_output: 'Tests +[1-9][0-9]* passed'",
        "      - id: upcast-v1",
        "        kind: command",
        "        run: pnpm test",
        "        expect_output: 'Tests +[1-9][0-9]* passed'",
        "      - id: one-adapter",
        "        kind: command",
        "        run: pnpm test",
        "        expect_output: 'Tests +[1-9][0-9]* passed'",
        "      - id: receipt-idempotent",
        "        kind: command",
        "        run: pnpm test",
        "        expect_output: 'Tests +[1-9][0-9]* passed'",
        "      - id: inverse-check",
        "        kind: command",
        "        run: pnpm test",
        "        expect_output: 'Tests +[1-9][0-9]* passed'",
        "      - id: stale-approval",
        "        kind: command",
        "        run: pnpm test",
        "        expect_output: 'Tests +[1-9][0-9]* passed'",
        "      - id: dogfood",
        "        kind: command",
        "        run: pnpm test",
        "",
      ].join("\n"),
    );
    const repoRoot = findRepoRoot(directory);
    if (repoRoot === undefined) throw new Error("expected a fixture repo root");

    const document = unwrap(await loadGraphDocument(graphFilePath(repoRoot, "0001-bootstrap")));
    const ledgerNode = document.nodes.find((node) => node.id === "ledger");
    const replayGate = ledgerNode?.gates.find((gate) => gate.id === "replay");
    expect(replayGate?.expectOutput?.source).toBe("Tests +[1-9][0-9]* passed");
    expect(replayGate?.expectOutput?.test("Tests 12 passed")).toBe(true);
    expect(replayGate?.expectOutput?.test("Tests 0 passed")).toBe(false);

    const testGateIds = [
      "replay",
      "illegal-states",
      "upcast-v1",
      "one-adapter",
      "receipt-idempotent",
      "inverse-check",
      "stale-approval",
    ];
    const allGates = document.nodes.flatMap((node) => node.gates);
    for (const gateId of testGateIds) {
      const declared = allGates.find((gate) => gate.id === gateId);
      expect(declared?.expectOutput?.source).toBe("Tests +[1-9][0-9]* passed");
    }

    const dogfoodGate = allGates.find((gate) => gate.id === "dogfood");
    expect(dogfoodGate?.expectOutput).toBeUndefined();
  });
});

describe("role", () => {
  const graphWithRole = (role: string): string =>
    ["interlock: graph@v0", "id: demo", "nodes:", "  - id: a", `    role: ${role}`, ""].join("\n");

  it.each(["scout", "planner", "implementer", "tester", "reviewer", "verifier"])(
    "parses the supplied role %s onto the node",
    (role) => {
      const document = unwrap(loadGraphDocumentText(graphWithRole(role), "graph.yaml"));
      expect(document.nodes[0]?.role).toBe(role);
    },
  );

  it("leaves role absent, not defaulted, when the graph names none", () => {
    const document = unwrap(
      loadGraphDocumentText(
        ["interlock: graph@v0", "id: demo", "nodes:", "  - id: a", ""].join("\n"),
        "graph.yaml",
      ),
    );
    expect(document.nodes[0]).toEqual({ id: "a", dependsOn: [], gates: [] });
    expect(document.nodes[0] !== undefined && "role" in document.nodes[0]).toBe(false);
  });

  it("refuses an unknown role with a sentence naming the nearest role", () => {
    const loaded = loadGraphDocumentText(graphWithRole("implmenter"), "graph.yaml");
    expect(isErr(loaded)).toBe(true);
    if (!isErr(loaded)) return;
    expect(explainGraphRefusal(loaded.error)).toBe(
      'graph.yaml: node "a": role "implmenter" is not one of scout, planner, implementer, tester, reviewer, verifier; the nearest is "implementer"',
    );
  });

  it("refuses a role that is not a string", () => {
    const loaded = loadGraphDocumentText(graphWithRole("[scout]"), "graph.yaml");
    expect(isErr(loaded)).toBe(true);
    if (!isErr(loaded)) return;
    expect(explainGraphRefusal(loaded.error)).toBe('graph.yaml: node "a": "role" must be a string');
  });
});

describe("ask", () => {
  const graphWithAsk = (ask: string): string =>
    ["interlock: graph@v0", "id: demo", ask, "nodes:", "  - id: a", ""].join("\n");

  it("reads the graph's ask verbatim", () => {
    const document = unwrap(
      loadGraphDocumentText(graphWithAsk("ask: Say where it stands."), "g.yaml"),
    );
    expect(document.ask).toBe("Say where it stands.");
  });

  it("leaves ask absent when the graph declares none", () => {
    const document = unwrap(loadGraphDocumentText(graphWithAsk(""), "g.yaml"));
    expect("ask" in document).toBe(false);
  });

  it("refuses an ask that is not a string", () => {
    const loaded = loadGraphDocumentText(graphWithAsk("ask: [one, two]"), "g.yaml");
    expect(isErr(loaded)).toBe(true);
    if (!isErr(loaded)) return;
    expect(explainGraphRefusal(loaded.error)).toBe('g.yaml: "ask" must be a string');
  });
});

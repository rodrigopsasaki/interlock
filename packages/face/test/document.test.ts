import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isErr, isOk, unwrap } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import { explainGraphRefusal, loadGraphDocument } from "../src/document.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined)
    rmSync(directory, { recursive: true, force: true });
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

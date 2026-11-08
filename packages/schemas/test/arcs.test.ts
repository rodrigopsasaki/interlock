import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { buildRegistry, validatorFor } from "../src/registry.ts";

const registry = buildRegistry();

function valid(tag: string, value: unknown): boolean {
  const validator = validatorFor(registry, tag);
  if (validator === undefined) throw new Error(`missing validator for ${tag}`);
  return validator(value);
}

const words = { words: "more words", source: "chat" };
const relation = { graph: "example/old", because: "replaced" };

describe("arcs schemas", () => {
  it("accepts v1's optional arc history and context fields", () => {
    expect(
      valid("arcs@v1", {
        interlock: "arcs@v1",
        repository: "example",
        arcs: [
          {
            id: "a",
            title: "A",
            ask: "the ask",
            ask_form: "placeholder",
            source: "chat",
            also_said: [words],
            graphs: [],
            superseded: [relation],
            context: [{ graph: "example/other", because: "related" }],
            version: "one",
            approved: words,
            passed: "line",
            authorized_by: words,
          },
        ],
      }),
    ).toBe(true);
  });

  it("accepts a v0 registry with adopter fields and remains strict about v1", () => {
    expect(
      valid("arcs@v0", {
        interlock: "arcs@v0",
        arcs: [
          {
            id: "a",
            title: "A",
            ask: "the ask",
            source: "chat",
            graphs: ["example/a"],
            superseded: [relation],
            context: [relation],
            version: "one",
            approved: words,
            passed: "line",
            authorized_by: words,
          },
        ],
        needs_his_words: [],
      }),
    ).toBe(true);
    expect(
      valid("arcs@v1", {
        interlock: "arcs@v1",
        repository: "example",
        arcs: [
          {
            id: "a",
            title: "A",
            ask: "the ask",
            source: "chat",
            graphs: ["example/a"],
            needs_his_words: [],
          },
        ],
      }),
    ).toBe(false);
  });

  it.each([
    ["missing repository", { interlock: "arcs@v1", arcs: [] }],
    [
      "list ask",
      {
        interlock: "arcs@v1",
        repository: "example",
        arcs: [{ id: "a", title: "A", ask: [], source: "chat", graphs: ["example/a"] }],
      },
    ],
    [
      "empty graphs without context",
      {
        interlock: "arcs@v1",
        repository: "example",
        arcs: [{ id: "a", title: "A", ask: "ask", source: "chat", graphs: [] }],
      },
    ],
    [
      "duplicate graph",
      {
        interlock: "arcs@v1",
        repository: "example",
        arcs: [
          { id: "a", title: "A", ask: "ask", source: "chat", graphs: ["example/a", "example/a"] },
        ],
      },
    ],
  ])("refuses %s", (_name, value) => {
    expect(valid("arcs@v1", value)).toBe(false);
  });

  it("keeps graph arc optional and validates the repository corpus", () => {
    expect(valid("graph@v0", { interlock: "graph@v0", id: "g", nodes: [], arc: "a" })).toBe(true);
    expect(valid("graph@v0", { interlock: "graph@v0", id: "g", nodes: [] })).toBe(true);

    const repository = join(import.meta.dirname, "..", "..", "..", ".interlock", "arcs.yaml");
    const arcs = parseYaml(readFileSync(repository, "utf-8"));
    expect(valid("arcs@v1", arcs)).toBe(true);
    if (typeof arcs === "object" && arcs !== null && !Array.isArray(arcs) && "arcs" in arcs) {
      const entries = arcs.arcs;
      expect(Array.isArray(entries)).toBe(true);
      if (Array.isArray(entries)) {
        expect(
          entries.filter(
            (entry) => typeof entry === "object" && entry !== null && "ask_form" in entry,
          ),
        ).toHaveLength(9);
      }
    }
  });
});

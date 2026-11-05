import { unwrap } from "@phyxiusjs/fp";
import { readBriefDocument, readDebriefDocument } from "debrief";
import { NODE_ROLES } from "face";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { buildRegistry } from "../src/registry.ts";

const registry = buildRegistry();

function valid(tag: string, value: unknown): boolean {
  const validate = registry.ajv.getSchema(
    `https://github.com/rodrigopsasaki/interlock/schemas/${tag}.json`,
  );
  if (validate === undefined) throw new Error(`${tag} schema is unavailable`);
  return validate(value) === true;
}

describe("roles@v0", () => {
  it.each(NODE_ROLES)("accepts an override of the %s role", (role) => {
    expect(
      valid("roles@v0", {
        interlock: "roles@v0",
        roles: {
          [role]: {
            prompt: "A paragraph.",
            debrief: { requires: ["decisions"], forbids: ["hunks"] },
            walk: [{ verb: "context", ask: "What holds here?" }],
          },
        },
      }),
    ).toBe(true);
  });

  it("refuses an unknown role, an unknown kind and an unknown verb", () => {
    expect(valid("roles@v0", { interlock: "roles@v0", roles: { reviwer: {} } })).toBe(false);
    expect(
      valid("roles@v0", {
        interlock: "roles@v0",
        roles: { tester: { debrief: { requires: ["tests"] } } },
      }),
    ).toBe(false);
    expect(
      valid("roles@v0", {
        interlock: "roles@v0",
        roles: { scout: { walk: [{ verb: "search", ask: "x" }] } },
      }),
    ).toBe(false);
  });
});

describe("brief@v1 and debrief@v2: what a role adds", () => {
  it("accepts a brief whose front matter carries a walk, and the reader agrees", () => {
    const front = [
      "interlock: brief@v1",
      "graph: g",
      "node: n",
      "role: reviewer",
      "gates: []",
      "scope: []",
      "substrate:",
      "  address: none",
      "walk:",
      "  kind: none",
      "  because: the substrate address is none, so there is nothing to ask",
    ].join("\n");
    expect(valid("brief@v1", parseYaml(front))).toBe(true);
    const read = unwrap(readBriefDocument(`---\n${front}\n---\n# brief\n`, "brief.md"));
    expect(read.kind === "v1" ? read.frontMatter.walk?.kind : undefined).toBe("none");
  });

  it("accepts a debrief carrying every role section, and the reader agrees", () => {
    const sha = "c".repeat(40);
    const text = [
      "interlock: debrief@v2",
      "graph: g",
      "node: n",
      "role: reviewer",
      `graph_base_sha: ${sha}`,
      `session_start_sha: ${sha}`,
      `head_sha: ${sha}`,
      "derivation: { kind: human, who: Rodrigo Sasaki }",
      "discoveries: []",
      "decisions: []",
      "gates_run_by_agent: []",
      "open: []",
      "proof: [{ test: a.test.ts, pins: the refusal, gate: a-proof }]",
      "findings: { lens: security, items: [{ id: f1, what: leak, found_at: 'a.ts:1' }] }",
      "graph_file: .interlock/graphs/0047-next.yaml",
      "marks: [{ claim: n/d, mark: gap, because: no term }]",
    ].join("\n");
    expect(valid("debrief@v2", parseYaml(text))).toBe(true);
    const read = unwrap(readDebriefDocument(text, "debrief.yaml"));
    expect(read.kind === "v2" ? read.debrief.marks : undefined).toEqual([
      { claim: "n/d", mark: "gap", because: "no term" },
    ]);
  });

  it("refuses a findings section with no lens", () => {
    const sha = "c".repeat(40);
    expect(
      valid("debrief@v2", {
        interlock: "debrief@v2",
        graph: "g",
        node: "n",
        role: "reviewer",
        graph_base_sha: sha,
        session_start_sha: sha,
        head_sha: sha,
        derivation: { kind: "human", who: "Rodrigo Sasaki" },
        discoveries: [],
        decisions: [],
        gates_run_by_agent: [],
        open: [],
        findings: { items: [] },
      }),
    ).toBe(false);
  });
});

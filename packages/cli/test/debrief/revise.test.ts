import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runDebriefRevise } from "../../src/debrief/revise.ts";

const runsRoot = join(import.meta.dirname, "..", ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function document(what: string): string {
  return [
    "interlock: debrief@v2",
    "graph: g",
    "node: n",
    "role: worker",
    `graph_base_sha: ${"a".repeat(40)}`,
    `session_start_sha: ${"b".repeat(40)}`,
    `head_sha: ${"c".repeat(40)}`,
    "derivation:",
    "  kind: agent",
    "  runtime: codex",
    "  model: gpt-5.6-terra",
    "discoveries: []",
    "decisions:",
    "  - id: c1",
    `    what: ${what}`,
    "    because: notes:1",
    "    rests_on: []",
    "    hunks: []",
    "gates_run_by_agent: []",
    "open: []",
    "",
  ].join("\n");
}

function fixture(): { readonly root: string; readonly candidate: string } {
  directory = mkdtempSync(join(runsRoot, "revise-"));
  const session = join(directory, ".interlock", "sessions", "g", "n");
  mkdirSync(session, { recursive: true });
  writeFileSync(
    join(session, "brief.md"),
    [
      "---",
      "interlock: brief@v1",
      "graph: g",
      "node: n",
      "role: worker",
      "gates: []",
      "scope: []",
      "substrate:",
      "  address: none",
      `graph_base_sha: ${"a".repeat(40)}`,
      "session: fixture-session",
      "---",
      "",
    ].join("\n"),
  );
  writeFileSync(join(session, "debrief.yaml"), document("original"));
  const candidate = join(session, "authored.yaml");
  writeFileSync(candidate, document("corrected"));
  return { root: directory, candidate };
}

describe("interlock debrief revise", () => {
  it("requires an explicit candidate path", async () => {
    const result = await runDebriefRevise(["g", "n"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("--from");
  });

  it("selects an authored v2 candidate and names all retained paths", async () => {
    const source = fixture();

    const result = await runDebriefRevise(["g", "n", "--from", source.candidate], {
      cwd: source.root,
    });

    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("selected");
    expect(result.message).toContain("retained");
    expect(result.message).toContain(source.candidate);
  });
});

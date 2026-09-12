import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isErr, isOk } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import { explainDebriefRefusal, readDebriefFile } from "../src/debrief.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function write(content: string): string {
  directory = mkdtempSync(join(runsRoot, "run-"));
  const path = join(directory, "debrief.yaml");
  writeFileSync(path, content);
  return path;
}

const SHA = "c".repeat(40);

describe("readDebriefFile", () => {
  it("refuses a missing file, naming the path", async () => {
    directory = mkdtempSync(join(runsRoot, "run-"));
    const path = join(directory, "debrief.yaml");
    const result = await readDebriefFile(path);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.kind).toBe("missing-file");
    expect(explainDebriefRefusal(result.error)).toContain(path);
  });

  it("refuses an unknown shape tag", async () => {
    const path = write(["interlock: debrief@v9", "graph: g", ""].join("\n"));
    const result = await readDebriefFile(path);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.kind).toBe("unknown-shape");
    const message = explainDebriefRefusal(result.error);
    expect(message).toContain("debrief@v9");
  });

  it("reads a debrief@v0 document as legacy-valid, reporting what v2 would add", async () => {
    const path = write(
      [
        "interlock: debrief@v0",
        "graph: g",
        "node: n",
        `base_sha: ${SHA}`,
        `head_sha: ${SHA}`,
        "derivation:",
        "  kind: agent",
        "  runtime: claude-code",
        "  model: claude-sonnet-5",
        "discoveries:",
        "  - id: d1",
        "    what: a thing",
        "    found_at: somewhere",
        "    mattered_because: it did",
        "decisions:",
        "  - id: c1",
        "    what: chose a thing",
        "    rests_on: []",
        "    hunks: []",
        "gates_run_by_agent:",
        "  - id: typecheck",
        "    result: pass",
        "open: []",
        "",
      ].join("\n"),
    );
    const result = await readDebriefFile(path);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value).toEqual({
      kind: "legacy",
      version: "debrief@v0",
      missingTopLevel: ["role", "session_start_sha"],
      decisionsMissingBecause: 1,
      decisionsTotal: 1,
    });
  });

  it("reads a debrief@v1 document as legacy-valid even when every decision already carries a because", async () => {
    const path = write(
      [
        "interlock: debrief@v1",
        "graph: g",
        "node: n",
        "role: worker",
        `graph_base_sha: ${SHA}`,
        `session_start_sha: ${SHA}`,
        `head_sha: ${SHA}`,
        "derivation:",
        "  kind: agent",
        "  runtime: claude-code",
        "  model: claude-sonnet-5",
        "discoveries: []",
        "decisions:",
        "  - id: c1",
        "    what: chose a thing",
        "    because: notes:1",
        "    rests_on: []",
        "    hunks: []",
        "gates_run_by_agent: []",
        "open: []",
        "",
      ].join("\n"),
    );
    const result = await readDebriefFile(path);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value).toEqual({
      kind: "legacy",
      version: "debrief@v1",
      missingTopLevel: [],
      decisionsMissingBecause: 0,
      decisionsTotal: 1,
    });
  });

  it("reads a well-formed debrief@v2 document and produces a Debrief", async () => {
    const path = write(
      [
        "interlock: debrief@v2",
        "graph: g",
        "node: n",
        "role: worker",
        `graph_base_sha: ${SHA}`,
        `session_start_sha: ${SHA}`,
        `head_sha: ${SHA}`,
        "derivation:",
        "  kind: agent",
        "  runtime: claude-code",
        "  model: claude-sonnet-5",
        "discoveries:",
        "  - id: d1",
        "    what: a thing",
        "    found_at: somewhere",
        "    mattered_because: it did",
        "decisions:",
        "  - id: c1",
        "    what: chose a thing",
        "    because: notes:1",
        "    rests_on: [notes:1]",
        "    hunks: [src/a.ts:1-2]",
        "gates_run_by_agent:",
        "  - id: typecheck",
        "    result: pass",
        "    invocation: pnpm typecheck",
        "open: []",
        "",
      ].join("\n"),
    );
    const result = await readDebriefFile(path);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.kind).toBe("v2");
    if (result.value.kind !== "v2") return;
    expect(result.value.debrief.graph).toBe("g");
    expect(result.value.debrief.decisions).toEqual([
      {
        id: "c1",
        what: "chose a thing",
        because: "notes:1",
        restsOn: ["notes:1"],
        hunks: ["src/a.ts:1-2"],
      },
    ]);
  });

  it("refuses a debrief@v2 decision without a because, naming it", async () => {
    const path = write(
      [
        "interlock: debrief@v2",
        "graph: g",
        "node: n",
        "role: worker",
        `graph_base_sha: ${SHA}`,
        `session_start_sha: ${SHA}`,
        `head_sha: ${SHA}`,
        "derivation:",
        "  kind: agent",
        "  runtime: claude-code",
        "  model: claude-sonnet-5",
        "discoveries: []",
        "decisions:",
        "  - id: c1",
        "    what: chose a thing",
        "    rests_on: []",
        "    hunks: []",
        "gates_run_by_agent: []",
        "open: []",
        "",
      ].join("\n"),
    );
    const result = await readDebriefFile(path);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(explainDebriefRefusal(result.error)).toContain("because");
  });

  it("refuses a head_sha that is not a SHA", async () => {
    const path = write(
      [
        "interlock: debrief@v2",
        "graph: g",
        "node: n",
        "role: worker",
        `graph_base_sha: ${SHA}`,
        `session_start_sha: ${SHA}`,
        "head_sha: not-a-sha",
        "derivation:",
        "  kind: agent",
        "  runtime: claude-code",
        "  model: claude-sonnet-5",
        "discoveries: []",
        "decisions: []",
        "gates_run_by_agent: []",
        "open: []",
        "",
      ].join("\n"),
    );
    const result = await readDebriefFile(path);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    const message = explainDebriefRefusal(result.error);
    expect(message).toContain("head_sha");
    expect(message).toContain("SHA");
  });

  it("reads a debrief@v2 document with a drafted marker", async () => {
    const path = write(
      [
        "interlock: debrief@v2",
        "graph: g",
        "node: n",
        "role: worker",
        `graph_base_sha: ${SHA}`,
        `session_start_sha: ${SHA}`,
        `head_sha: ${SHA}`,
        "derivation:",
        "  kind: agent",
        "  runtime: claude-code",
        "  model: claude-sonnet-5",
        "discoveries: []",
        "decisions: []",
        "gates_run_by_agent: []",
        "open: []",
        "drafted:",
        "  by: Rodrigo Sasaki",
        `  from: ${SHA}`,
        "",
      ].join("\n"),
    );
    const result = await readDebriefFile(path);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.kind).toBe("v2");
    if (result.value.kind !== "v2") return;
    expect(result.value.debrief.drafted).toEqual({
      by: "Rodrigo Sasaki",
      from: SHA,
    });
  });
});

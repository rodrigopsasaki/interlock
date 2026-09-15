import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isErr, isOk } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import { debriefRevisionsDirectory, reviseDebrief } from "../src/index.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

const GRAPH = "g";
const NODE = "n";
const BASE = "a".repeat(40);
const START = "b".repeat(40);

function debrief(options: {
  readonly role?: string;
  readonly start?: string;
  readonly version?: string;
  readonly what: string;
}): string {
  return [
    `interlock: ${options.version ?? "debrief@v2"}`,
    `graph: ${GRAPH}`,
    `node: ${NODE}`,
    `role: ${options.role ?? "worker"}`,
    `graph_base_sha: ${BASE}`,
    `session_start_sha: ${options.start ?? START}`,
    `head_sha: ${"c".repeat(40)}`,
    "derivation:",
    "  kind: agent",
    "  runtime: codex",
    "  model: gpt-5.6-terra",
    "discoveries: []",
    "decisions:",
    "  - id: c1",
    `    what: ${options.what}`,
    "    because: notes:1",
    "    rests_on: []",
    "    hunks: []",
    "gates_run_by_agent: []",
    "open: []",
    "",
  ].join("\n");
}

function fixture(current = debrief({ what: "original" })): {
  readonly root: string;
  readonly session: string;
  readonly current: string;
} {
  directory = mkdtempSync(join(runsRoot, "revise-"));
  const session = join(directory, ".interlock", "sessions", GRAPH, NODE);
  mkdirSync(session, { recursive: true });
  writeFileSync(
    join(session, "brief.md"),
    [
      "---",
      "interlock: brief@v1",
      `graph: ${GRAPH}`,
      `node: ${NODE}`,
      "role: worker",
      "gates: []",
      "scope: []",
      "substrate:",
      "  address: none",
      `graph_base_sha: ${BASE}`,
      "session: fixture-session",
      "---",
      "",
    ].join("\n"),
  );
  const currentPath = join(session, "debrief.yaml");
  writeFileSync(currentPath, current);
  return { root: directory, session, current: currentPath };
}

function candidate(session: string, content = debrief({ what: "corrected" })): string {
  const path = join(session, "authored-correction.yaml");
  writeFileSync(path, content);
  return path;
}

describe("reviseDebrief", () => {
  it("archives exact current bytes and atomically selects exact authored candidate bytes", async () => {
    const initial = `${debrief({ what: "original" })}revision: 1\n`;
    const source = fixture(initial);
    const authored = `${debrief({ what: "corrected" })}revision: 2\n`;
    const from = candidate(source.session, authored);

    const result = await reviseDebrief(source.root, GRAPH, NODE, from);

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.changed).toBe(true);
    expect(readFileSync(source.current)).toEqual(Buffer.from(authored));
    expect(readFileSync(from)).toEqual(Buffer.from(authored));
    expect(readFileSync(result.value.archivePath)).toEqual(Buffer.from(initial));
  });

  it("treats selecting already-current bytes as a no-op", async () => {
    const source = fixture();
    const from = candidate(source.session, readFileSync(source.current).toString("utf8"));

    const result = await reviseDebrief(source.root, GRAPH, NODE, from);

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.changed).toBe(false);
    expect(() => readFileSync(result.value.archivePath)).toThrow();
  });

  it("refuses a candidate whose role does not belong to this session", async () => {
    const source = fixture();
    const from = candidate(source.session, debrief({ role: "interpreter", what: "wrong role" }));

    const result = await reviseDebrief(source.root, GRAPH, NODE, from);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.kind).toBe("identity");
    expect(readFileSync(source.current).toString("utf8")).toContain("original");
  });

  it("refuses a candidate from another session start", async () => {
    const source = fixture();
    const from = candidate(
      source.session,
      debrief({ start: "d".repeat(40), what: "wrong session" }),
    );

    const result = await reviseDebrief(source.root, GRAPH, NODE, from);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.kind).toBe("identity");
    expect(readFileSync(source.current).toString("utf8")).toContain("original");
  });

  it("refuses legacy candidates without changing the canonical debrief", async () => {
    const source = fixture();
    const from = candidate(source.session, debrief({ version: "debrief@v1", what: "legacy" }));

    const result = await reviseDebrief(source.root, GRAPH, NODE, from);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.kind).toBe("candidate-read");
    expect(readFileSync(source.current).toString("utf8")).toContain("original");
  });

  it("refuses malformed candidates without changing the canonical debrief", async () => {
    const source = fixture();
    const from = candidate(source.session, "interlock: debrief@v2\ngraph: [\n");

    const result = await reviseDebrief(source.root, GRAPH, NODE, from);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.kind).toBe("candidate-read");
    expect(readFileSync(source.current).toString("utf8")).toContain("original");
  });

  it("refuses a candidate path outside this session directory", async () => {
    const source = fixture();
    const outside = join(source.root, "outside.yaml");
    writeFileSync(outside, debrief({ what: "outside" }));

    const result = await reviseDebrief(source.root, GRAPH, NODE, outside);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.kind).toBe("candidate-path");
  });

  it("refuses a symbolic-link candidate", async () => {
    const source = fixture();
    const outside = join(source.root, "outside.yaml");
    writeFileSync(outside, debrief({ what: "outside" }));
    const from = join(source.session, "linked.yaml");
    symlinkSync(outside, from);

    const result = await reviseDebrief(source.root, GRAPH, NODE, from);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.kind).toBe("candidate-path");
  });

  it("refuses a differing archive collision before replacing the canonical bytes", async () => {
    const source = fixture();
    const from = candidate(source.session);
    const revisions = debriefRevisionsDirectory(source.root, GRAPH, NODE);
    mkdirSync(revisions, { recursive: true });
    const digest = createHash("sha256").update(readFileSync(source.current)).digest("hex");
    writeFileSync(join(revisions, `${digest}.yaml`), debrief({ what: "collision" }));

    const result = await reviseDebrief(source.root, GRAPH, NODE, from);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.kind).toBe("archive-collision");
    expect(readFileSync(source.current).toString("utf8")).toContain("original");
  });

  it("preserves the canonical bytes when retaining the original cannot create revisions", async () => {
    const source = fixture();
    const from = candidate(source.session);
    writeFileSync(debriefRevisionsDirectory(source.root, GRAPH, NODE), "not a directory");

    const result = await reviseDebrief(source.root, GRAPH, NODE, from);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.kind).toBe("write-failed");
    expect(readFileSync(source.current).toString("utf8")).toContain("original");
  });
});

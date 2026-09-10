import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { gitInitFixture } from "./gitFixture.ts";

vi.mock("ledger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ledger")>();
  return {
    ...actual,
    createLedger: vi.fn(actual.createLedger),
    attachLedgerSink: vi.fn(actual.attachLedgerSink),
  };
});

const { createLedger, attachLedgerSink } = await import("ledger");
const { runGraphShow } = await import("../../src/graph/show.ts");

const runsRoot = join(import.meta.dirname, "..", ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined)
    rmSync(directory, { recursive: true, force: true });
  directory = undefined;
  vi.clearAllMocks();
});

const validGraph = [
  "interlock: graph@v0",
  "id: demo",
  "nodes:",
  "  - id: a",
  "    depends_on: []",
  "",
].join("\n");

function fixture(graphYaml: string): string {
  directory = mkdtempSync(join(runsRoot, "run-"));
  gitInitFixture(directory);
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  writeFileSync(
    join(directory, ".interlock", "graphs", "demo.yaml"),
    graphYaml,
  );
  return directory;
}

describe("graph show", () => {
  it("renders a position for a valid graph over an empty journal", async () => {
    const cwd = fixture(validGraph);
    const result = await runGraphShow(["demo"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("not approved");
    expect(result.message).toContain("a — ready");
  });

  it("refuses a malformed graph with a sentence naming the file", async () => {
    const cwd = fixture(
      ["interlock: graph@v1", "id: demo", "nodes: []", ""].join("\n"),
    );
    const result = await runGraphShow(["demo"], { cwd });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("demo.yaml");
    expect(result.message).toContain("graph@v0");
  });

  it("refuses with a sentence when no graph id is given", async () => {
    const result = await runGraphShow([]);
    expect(result.exitCode).not.toBe(0);
  });

  it("refuses with a sentence naming the line when the journal carries a ReplayRefusal", async () => {
    const cwd = fixture(validGraph);
    mkdirSync(join(cwd, ".interlock", "ledger"), { recursive: true });
    writeFileSync(
      join(cwd, ".interlock", "ledger", "journal.jsonl"),
      `${JSON.stringify({ interlock: "event@v99", kind: "node-created" })}\n`,
    );
    const result = await runGraphShow(["demo"], { cwd });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("line 1");
    expect(result.message).toContain("event@v99");
  });
});

describe("show-never-writes", () => {
  it("never creates a journal directory on disk", async () => {
    const cwd = fixture(validGraph);
    const result = await runGraphShow(["demo"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(cwd, ".interlock", "ledger"))).toBe(false);
  });

  it("never opens a ledger for writing: createLedger and attachLedgerSink are never called", async () => {
    const cwd = fixture(validGraph);
    await runGraphShow(["demo"], { cwd });
    expect(createLedger).not.toHaveBeenCalled();
    expect(attachLedgerSink).not.toHaveBeenCalled();
  });
});

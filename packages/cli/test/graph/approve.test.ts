import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runGraphApprove } from "../../src/graph/approve.ts";
import { runGraphShow } from "../../src/graph/show.ts";

const runsRoot = join(import.meta.dirname, "..", ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined)
    rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

const validGraph = [
  "interlock: graph@v0",
  "id: demo",
  "gates:",
  "  - id: approved",
  "    kind: human",
  "nodes:",
  "  - id: a",
  "    depends_on: []",
  "",
].join("\n");

function fixture(graphYaml: string): string {
  directory = mkdtempSync(join(runsRoot, "run-"));
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  writeFileSync(
    join(directory, ".interlock", "graphs", "demo.yaml"),
    graphYaml,
  );
  return directory;
}

function journalEventKinds(cwd: string): readonly string[] {
  const raw = readFileSync(
    join(cwd, ".interlock", "ledger", "journal.jsonl"),
    "utf-8",
  );
  return raw
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line): string => {
      const parsed: unknown = JSON.parse(line);
      return typeof parsed === "object" && parsed !== null && "kind" in parsed
        ? String((parsed as Record<string, unknown>)["kind"])
        : "";
    });
}

describe("graph approve", () => {
  it("refuses without --because", async () => {
    const cwd = fixture(validGraph);
    const result = await runGraphApprove(["demo", "--by", "Rodrigo Sasaki"], {
      cwd,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("--because");
    expect(existsSync(join(cwd, ".interlock", "ledger"))).toBe(false);
  });

  it("refuses without --by", async () => {
    const cwd = fixture(validGraph);
    const result = await runGraphApprove(["demo", "--because", "looks right"], {
      cwd,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("--by");
  });

  it("refuses a graph file that fails validation, through the same validator show uses", async () => {
    const cwd = fixture(
      ["interlock: graph@v1", "id: demo", "nodes: []", ""].join("\n"),
    );
    const result = await runGraphApprove(
      ["demo", "--by", "Rodrigo Sasaki", "--because", "looks right"],
      { cwd },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("graph@v0");
    expect(existsSync(join(cwd, ".interlock", "ledger"))).toBe(false);
  });

  it("writes exactly a node-created and a gate-moved event, nothing else", async () => {
    const cwd = fixture(validGraph);
    const result = await runGraphApprove(
      ["demo", "--by", "Rodrigo Sasaki", "--because", "looks right"],
      { cwd },
    );
    expect(result.exitCode).toBe(0);
    expect(journalEventKinds(cwd)).toEqual(["node-created", "gate-moved"]);
  });

  it("does not re-append node-created on a second approval of the same graph", async () => {
    const cwd = fixture(validGraph);
    await runGraphApprove(
      ["demo", "--by", "Rodrigo Sasaki", "--because", "first"],
      { cwd },
    );
    await runGraphApprove(
      ["demo", "--by", "Rodrigo Sasaki", "--because", "second"],
      { cwd },
    );
    expect(journalEventKinds(cwd)).toEqual([
      "node-created",
      "gate-moved",
      "gate-moved",
    ]);
  });

  it("makes a subsequent show report approved", async () => {
    const cwd = fixture(validGraph);
    const before = await runGraphShow(["demo"], { cwd });
    expect(before.message).toContain("not approved");

    const approved = await runGraphApprove(
      ["demo", "--by", "Rodrigo Sasaki", "--because", "looks right"],
      { cwd },
    );
    expect(approved.exitCode).toBe(0);

    const after = await runGraphShow(["demo"], { cwd });
    expect(after.exitCode).toBe(0);
    expect(after.message).toMatch(/graph demo — approved/);
  });

  it("flips to stale after the graph file changes, matching the stale-approval rule", async () => {
    const cwd = fixture(validGraph);
    await runGraphApprove(
      ["demo", "--by", "Rodrigo Sasaki", "--because", "looks right"],
      { cwd },
    );

    writeFileSync(
      join(cwd, ".interlock", "graphs", "demo.yaml"),
      `${validGraph} `,
    );

    const after = await runGraphShow(["demo"], { cwd });
    expect(after.message).toMatch(/graph demo — stale/);
  });
});

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { isLedgerEvent } from "ledger";
import { afterEach, describe, expect, it } from "vitest";
import { commitAll, gitInitFixture } from "./graph/gitFixture.ts";
import { runInterlockBackfill } from "../src/backfill.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined)
    rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function fixture(): string {
  directory = mkdtempSync(join(runsRoot, "backfill-"));
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  gitInitFixture(directory);
  return directory;
}

const configYaml = ["interlock: config@v0", "standing_gates: []", ""].join(
  "\n",
);

function graphYamlWithGate(run: string): string {
  return [
    "interlock: graph@v0",
    "id: demo",
    "nodes:",
    "  - id: node-a",
    "    depends_on: []",
    "    gates:",
    "      - id: own-gate",
    "        kind: command",
    `        run: "${run}"`,
    "",
  ].join("\n");
}

function localYamlWithWorktreeSetup(...commands: readonly string[]): string {
  return [
    "interlock: local@v0",
    "runtime:",
    "  kind: claude",
    "  args: []",
    "worktree_root: .worktrees",
    "worktree_setup:",
    ...commands.map((command) => `  - "${command}"`),
    "lease_ms: 60000",
    "run_timeout_ms: 30000",
    "substrate:",
    "  address: none",
    "",
  ].join("\n");
}

const localYamlNoSetup = [
  "interlock: local@v0",
  "runtime:",
  "  kind: claude",
  "  args: []",
  "worktree_root: .worktrees",
  "lease_ms: 60000",
  "run_timeout_ms: 30000",
  "substrate:",
  "  address: none",
  "",
].join("\n");

// No shell splits these, so the -e script itself must contain no whitespace; single quotes
// keep it clear of the double-quoted YAML scalar it lands in.
const markerSetupCommand = `${process.execPath} -e require('node:fs').writeFileSync('marker.txt','done')`;
const markerGateCommand = `${process.execPath} -e process.exit(require('node:fs').existsSync('marker.txt')?0:1)`;
const passCommand = `${process.execPath} -e process.exit(0)`;
const failingSetupCommand = `${process.execPath} -e process.exit(7)`;

function fixtureForBackfill(options: {
  readonly localYaml: string;
  readonly gateRun: string;
}): string {
  directory = mkdtempSync(join(runsRoot, "backfill-"));
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({ name: "fixture", private: true }),
  );
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  writeFileSync(
    join(directory, ".interlock", "graphs", "demo.yaml"),
    graphYamlWithGate(options.gateRun),
  );
  writeFileSync(join(directory, ".interlock", "config.yaml"), configYaml);
  writeFileSync(join(directory, ".interlock", "local.yaml"), options.localYaml);
  mkdirSync(join(directory, ".interlock", "sessions", "demo", "node-a"), {
    recursive: true,
  });
  writeFileSync(
    join(directory, ".interlock", "sessions", "demo", "node-a", "debrief.yaml"),
    "interlock: debrief@v1\n",
  );
  gitInitFixture(directory);
  commitAll(directory, "fixture content");
  return directory;
}

describe("interlock backfill", () => {
  it("refuses without a graph id", async () => {
    const result = await runInterlockBackfill([]);
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("interlock backfill");
  });

  it("refuses without local.yaml, naming the fields", async () => {
    const cwd = fixture();
    const result = await runInterlockBackfill(["demo"], { cwd });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("local.yaml");
  });

  it("refuses a graph that has no file on disk", async () => {
    const cwd = fixture();
    writeFileSync(
      join(cwd, ".interlock", "local.yaml"),
      [
        "interlock: local@v0",
        "runtime:",
        "  kind: claude",
        "  args: []",
        "worktree_root: .worktrees",
        "lease_ms: 60000",
        "run_timeout_ms: 5000",
        "substrate:",
        "  address: none",
        "",
      ].join("\n"),
    );
    const result = await runInterlockBackfill(["demo"], { cwd });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("no such file");
  });

  it("runs worktree_setup commands in the backfill worktree before the first gate", async () => {
    const cwd = fixtureForBackfill({
      localYaml: localYamlWithWorktreeSetup(markerSetupCommand),
      gateRun: markerGateCommand,
    });

    const result = await runInterlockBackfill(["demo"], { cwd });

    expect(result.exitCode).toBe(0);
    expect(result.message).toBe("demo: backfilled 1 node(s).\nnode-a: cleared");
  }, 30_000);

  it("refuses on a failing worktree_setup command, naming it and its exit code, and gates nothing", async () => {
    const cwd = fixtureForBackfill({
      localYaml: localYamlWithWorktreeSetup(failingSetupCommand),
      gateRun: passCommand,
    });

    const result = await runInterlockBackfill(["demo"], { cwd });

    expect(result.exitCode).toBe(1);
    expect(result.message).toBe(`"${failingSetupCommand}" exited 7.`);

    const journalPath = join(cwd, ".interlock", "ledger", "journal.jsonl");
    const events = existsSync(journalPath)
      ? readFileSync(journalPath, "utf-8")
          .trim()
          .split("\n")
          .filter((line) => line.length > 0)
          .map((line): unknown => JSON.parse(line))
          .filter(isLedgerEvent)
      : [];
    expect(events.some((event) => event.kind === "session-started")).toBe(
      false,
    );
  }, 30_000);

  it("changes nothing when worktree_setup is empty", async () => {
    const cwd = fixtureForBackfill({
      localYaml: localYamlNoSetup,
      gateRun: passCommand,
    });

    const lines: string[] = [];
    const result = await runInterlockBackfill(["demo"], {
      cwd,
      narrate: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(0);
    expect(result.message).toBe("demo: backfilled 1 node(s).\nnode-a: cleared");
    expect(lines.some((line) => line.startsWith("worktree setup:"))).toBe(
      false,
    );
  }, 30_000);
});

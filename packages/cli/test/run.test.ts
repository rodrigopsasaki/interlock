import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { ok } from "@phyxiusjs/fp";
import type { Runtime } from "runner";
import { afterEach, describe, expect, it } from "vitest";
import { commitAll, gitInitFixture } from "./graph/gitFixture.ts";
import { runGraphApprove } from "../src/graph/approve.ts";
import { runInterlockRun } from "../src/run.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined)
    rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

const graphYaml = [
  "interlock: graph@v0",
  "id: demo",
  "gates:",
  "  - id: approved",
  "    kind: human",
  "nodes:",
  "  - id: a",
  "    acceptance: a trivial node",
  "    depends_on: []",
  "    gates:",
  "      - id: own-gate",
  "        kind: command",
  '        run: "true"',
  "",
].join("\n");

const configYaml = [
  "interlock: config@v0",
  "standing_gates:",
  "  - id: standing",
  "    kind: command",
  '    run: "true"',
  "",
].join("\n");

const localYaml = [
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
].join("\n");

function fixture(
  options: { readonly withLocal?: boolean; readonly withBrief?: boolean } = {},
): string {
  directory = mkdtempSync(join(runsRoot, "run-"));
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  writeFileSync(
    join(directory, ".interlock", "graphs", "demo.yaml"),
    graphYaml,
  );
  writeFileSync(join(directory, ".interlock", "config.yaml"), configYaml);
  if (options.withLocal !== false) {
    writeFileSync(join(directory, ".interlock", "local.yaml"), localYaml);
  }
  if (options.withBrief !== false) {
    mkdirSync(join(directory, ".interlock", "sessions", "demo", "a"), {
      recursive: true,
    });
    writeFileSync(
      join(directory, ".interlock", "sessions", "demo", "a", "brief.md"),
      "# brief\n",
    );
  }
  gitInitFixture(directory);
  commitAll(directory, "fixture content");
  return directory;
}

function stubRuntime(): Runtime {
  return {
    openPane: () => Promise.resolve(ok({ id: "pane-1" })),
    startAgent: (pane) => Promise.resolve(ok({ id: "agent-1", pane })),
    reportIdentity: () => Promise.resolve(ok(undefined)),
    waitUntil: () => Promise.resolve(ok("idle")),
    read: () => Promise.resolve(ok("")),
    closePane: () => Promise.resolve(ok(undefined)),
  };
}

describe("interlock run", () => {
  it("refuses without a graph and node", async () => {
    const result = await runInterlockRun([]);
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("interlock run");
  });

  it("refuses a graph that has no file on disk", async () => {
    directory = mkdtempSync(join(runsRoot, "run-"));
    mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
    writeFileSync(join(directory, ".interlock", "config.yaml"), configYaml);
    writeFileSync(join(directory, ".interlock", "local.yaml"), localYaml);
    gitInitFixture(directory);
    commitAll(directory, "fixture content");

    const result = await runInterlockRun(["demo", "a"], { cwd: directory });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("no such file");
  });

  it("refuses without local.yaml, naming the fields", async () => {
    const cwd = fixture({ withLocal: false });
    const result = await runInterlockRun(["demo", "a"], { cwd });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("local.yaml");
    expect(result.message).toContain("worktree_root");
  });

  it("refuses a graph that has not been approved", async () => {
    const cwd = fixture();
    const result = await runInterlockRun(["demo", "a"], { cwd });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("not approved");
  });

  it("refuses a node that is not declared on the graph", async () => {
    const cwd = fixture();
    await runGraphApprove(
      ["demo", "--by", "Rodrigo Sasaki", "--because", "looks right"],
      { cwd },
    );
    const result = await runInterlockRun(["demo", "no-such-node"], { cwd });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("no-such-node");
  });

  it("refuses a node with no brief, without leasing it", async () => {
    const cwd = fixture({ withBrief: false });
    await runGraphApprove(
      ["demo", "--by", "Rodrigo Sasaki", "--because", "looks right"],
      { cwd },
    );
    const journalBefore = readFileSync(
      join(cwd, ".interlock", "ledger", "journal.jsonl"),
      "utf-8",
    );

    const result = await runInterlockRun(["demo", "a"], { cwd });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("no brief");
    const journalAfter = readFileSync(
      join(cwd, ".interlock", "ledger", "journal.jsonl"),
      "utf-8",
    );
    expect(journalAfter).toBe(journalBefore);
  });

  it("leases, worktrees, drives the injected runtime and gates a real node end to end", async () => {
    const cwd = fixture();
    await runGraphApprove(
      ["demo", "--by", "Rodrigo Sasaki", "--because", "looks right"],
      { cwd },
    );

    const result = await runInterlockRun(["demo", "a"], {
      cwd,
      clock: createControlledClock(),
      runtime: stubRuntime(),
    });

    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("cleared");
    expect(existsSync(join(cwd, ".worktrees", "a"))).toBe(true);
  }, 30_000);

  it("writes the brief into the worktree even though the node's brief is committed after the graph's own base SHA", async () => {
    directory = mkdtempSync(join(runsRoot, "run-"));
    const cwd = directory;
    mkdirSync(join(cwd, ".interlock", "graphs"), { recursive: true });
    writeFileSync(join(cwd, ".interlock", "graphs", "demo.yaml"), graphYaml);
    writeFileSync(join(cwd, ".interlock", "config.yaml"), configYaml);
    writeFileSync(join(cwd, ".interlock", "local.yaml"), localYaml);
    gitInitFixture(cwd);
    commitAll(cwd, "graph content");

    await runGraphApprove(
      ["demo", "--by", "Rodrigo Sasaki", "--because", "looks right"],
      { cwd },
    );

    mkdirSync(join(cwd, ".interlock", "sessions", "demo", "a"), {
      recursive: true,
    });
    writeFileSync(
      join(cwd, ".interlock", "sessions", "demo", "a", "brief.md"),
      "# brief\n",
    );
    commitAll(cwd, "brief for node a");

    const result = await runInterlockRun(["demo", "a"], {
      cwd,
      clock: createControlledClock(),
      runtime: stubRuntime(),
    });

    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("cleared");
    const briefInWorktree = join(
      cwd,
      ".worktrees",
      "a",
      ".interlock",
      "sessions",
      "demo",
      "a",
      "brief.md",
    );
    expect(existsSync(briefInWorktree)).toBe(true);
    expect(readFileSync(briefInWorktree, "utf-8")).toBe("# brief\n");
  }, 30_000);
});

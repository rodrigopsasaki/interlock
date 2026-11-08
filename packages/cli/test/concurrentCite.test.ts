import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runGateClear } from "../src/gate/clear.ts";
import { gitInitFixture } from "./graph/gitFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });
let directory: string | undefined;

function fixture(): { readonly cwd: string; readonly machine: string } {
  directory = mkdtempSync(join(runsRoot, "concurrent-cite-"));
  gitInitFixture(directory);
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  writeFileSync(
    join(directory, ".interlock", "graphs", "demo.yaml"),
    [
      "interlock: graph@v0",
      "id: demo",
      "gates:",
      "  - id: approved",
      "    kind: human",
      "nodes:",
      "  - id: a",
      "    depends_on: []",
      "    gates:",
      "      - id: witnessed",
      "        kind: human",
      "  - id: b",
      "    depends_on: []",
      "    gates:",
      "      - id: witnessed",
      "        kind: human",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(directory, ".interlock", "config.yaml"),
    "interlock: config@v0\nstanding_gates: []\n",
  );
  writeFileSync(
    join(directory, ".interlock", "local.yaml"),
    "interlock: local@v1\nruntime:\n  kind: claude\n  worktree_root: .worktrees\n  lease_ms: 1000\n  run_timeout_ms: 1000\nsubstrate:\n  address: none\nowner_login: owner\n",
  );
  const provider = join(directory, "cite-provider.mjs");
  writeFileSync(
    provider,
    "process.stdout.write(JSON.stringify({verified:true,author:'owner',words:'words',at:'2026-11-08T00:00:00Z'}));\n",
  );
  const machine = join(directory, "machine.yaml");
  writeFileSync(
    machine,
    [
      "interlock: machine@v0",
      "provider:",
      "  admit: [admit]",
      "  release: [release]",
      "  env: [env]",
      "  heavy: [heavy]",
      "  cite:",
      `    - ${JSON.stringify(process.execPath)}`,
      `    - ${JSON.stringify(provider)}`,
      "    - '{kind}'",
      "    - '{id}'",
      "",
    ].join("\n"),
  );
  return { cwd: directory, machine };
}

function args(node: string): string[] {
  return [
    "demo",
    node,
    "witnessed",
    "--by",
    "driver",
    "--because",
    "because",
    "--for",
    "owner",
    "--cites",
    "said:shared",
    "--reading",
    "clear witnessed",
  ];
}

afterEach(() => {
  delete process.env["INTERLOCK_CITE_PAUSE_AFTER_CHECK_MS"];
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("delegated cite locking", () => {
  it("allows exactly one concurrent spend and takes over a dead holder", async () => {
    const { cwd, machine } = fixture();
    process.env["INTERLOCK_CITE_PAUSE_AFTER_CHECK_MS"] = "150";
    const results = await Promise.all([
      runGateClear(args("a"), { cwd, machinePath: machine }),
      runGateClear(args("b"), { cwd, machinePath: machine }),
    ]);
    delete process.env["INTERLOCK_CITE_PAUSE_AFTER_CHECK_MS"];
    if (results.every((result) => result.exitCode === 0)) throw new Error(JSON.stringify(results));
    expect(results.filter((result) => result.exitCode === 0)).toHaveLength(1);
    expect(results.filter((result) => result.exitCode === 1)).toHaveLength(1);
    expect(results.find((result) => result.exitCode === 1)?.message).toContain(
      "already authorized clear",
    );
    expect(
      readFileSync(join(cwd, ".interlock", "ledger", "journal.jsonl"), "utf8").match(/gate-moved/g),
    ).toHaveLength(1);

    writeFileSync(
      join(cwd, ".interlock", "ledger", ".cite-spend.lock"),
      JSON.stringify({ pid: 999999, at: 0 }),
    );
    const takeover = await runGateClear(args("b"), { cwd, machinePath: machine });
    expect(takeover.exitCode).toBe(1);
    expect(takeover.message).toContain("already authorized clear");
  });
});

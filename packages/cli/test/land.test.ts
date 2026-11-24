import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSystemClock } from "@phyxiusjs/clock";
import { isErr, ok } from "@phyxiusjs/fp";
import { sharedJournalDirectory } from "face";
import { createLedger, derivation, duration, spend } from "ledger";
import { afterEach, describe, expect, it } from "vitest";
import { fixtureGit } from "../../../test/support/gitFixture.ts";
import { createFixtureEnvironment } from "../../runner/src/fixtureEnv.ts";
import { runInterlockLand } from "../src/land.ts";
import { run } from "../src/main.ts";
import { initFixtureRepositoryWithIdentity } from "./support/gitFixture.ts";

const runsRoot = tmpdir();
mkdirSync(runsRoot, { recursive: true });
const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
};

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function repository(): string {
  directory = mkdtempSync(join(runsRoot, "land-"));
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  writeFileSync(
    join(directory, ".interlock", "graphs", "demo.yaml"),
    [
      "interlock: graph@v0",
      "id: demo",
      "known_environment_failures:",
      "  - test/known.test.ts",
      "nodes:",
      "  - id: a",
      "    depends_on: []",
      "    gates:",
      "      - id: own-gate",
      "        kind: command",
      "        run: pnpm test",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(directory, ".interlock", "config.yaml"),
    ["interlock: config@v0", "standing_gates: []", ""].join("\n"),
  );
  writeFileSync(
    join(directory, ".interlock", "local.yaml"),
    [
      "interlock: local@v1",
      "runtime:",
      "  kind: fixture",
      "  args: []",
      "worktree_root: .worktrees",
      "lease_ms: 60000",
      "run_timeout_ms: 60000",
      "substrate:",
      "  address: none",
      "",
    ].join("\n"),
  );
  initFixtureRepositoryWithIdentity(directory, { defaultBranch: "main", env: gitEnv });
  fixtureGit(["add", "-A"], { cwd: directory, env: gitEnv });
  fixtureGit(["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "fixture content"], {
    cwd: directory,
    env: gitEnv,
  });
  return directory;
}

async function clearNode(root: string): Promise<void> {
  const journal = await sharedJournalDirectory(root);
  const ledger = await createLedger({ clock: createSystemClock(), directory: journal });
  if (isErr(ledger)) throw new Error("fixture ledger did not open");
  const head = fixtureGit(["rev-parse", "HEAD"], { cwd: root, env: gitEnv }).trim();
  const receipt = {
    id: "fixture-receipt",
    gate: "own-gate",
    commitSha: head,
    spend: spend.none(),
    duration: duration.unknown(),
    derivation: derivation.gate("own-gate", "runner@0", "fixture"),
    proof: {},
  };
  ledger.value.append({
    kind: "outcome-set",
    node: { graph: "demo", id: "a" },
    outcome: { kind: "cleared", receipts: [receipt] },
  });
  await ledger.value.close();
}

describe("interlock land", () => {
  it("routes the command and refuses a node that is not cleared", async () => {
    const result = await run(["land"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("interlock land");
  });

  it("runs graph and repository suites one at a time in the fixture environment", async () => {
    const root = repository();
    await clearNode(root);
    const fixture = createFixtureEnvironment({ baseEnv: process.env });
    const calls: string[][] = [];
    let active = 0;
    let maximum = 0;
    const narrated: string[] = [];
    const result = await runInterlockLand(
      ["demo", "a", "--test-workers", "3", "--heap-mb", "512"],
      {
        cwd: root,
        machine: { env: {}, heavy: [] },
        fixture,
        install: async () => ok(undefined),
        mergeMain: async () => ok({ kind: "unchanged", mainRef: "main" }),
        commandRunner: async (argv, _cwd, env) => {
          calls.push([...argv]);
          active += 1;
          maximum = Math.max(maximum, active);
          expect(env["HOME"]).toBe(fixture.env["HOME"]);
          expect(env["VITEST_MAX_WORKERS"]).toBe("3");
          expect(env["NODE_OPTIONS"]).toBe("--max-old-space-size=512");
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          active -= 1;
          const output = argv.includes("test") ? "test/known.test.ts failed" : "passed";
          return {
            exitCode: argv.includes("test") ? 1 : 0,
            output,
            stdout: Buffer.from(output),
            stderr: Buffer.alloc(0),
          };
        },
        narrate: (line) => narrated.push(line),
      },
    );
    fixture.cleanup();

    expect(result.exitCode).toBe(0);
    expect(maximum).toBe(1);
    expect(calls).toHaveLength(4);
    expect(narrated).toContain("known environment failure: test/known.test.ts");
    expect(narrated.some((line) => line.includes("land/demo/a"))).toBe(true);
    expect(result.message).toMatch(/^land\/demo\/a: [0-9a-f]{40} \(signatures: G\)$/);
    expect(readFileSync(join(root, ".git", "HEAD"), "utf8")).toContain("refs/heads/main");
  });
});

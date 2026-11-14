import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { isErr } from "@phyxiusjs/fp";
import { nodeKey } from "ledger";
import { noneClient } from "substrate";
import { afterEach, describe, expect, it } from "vitest";
import { judgeGates } from "../src/gateJudge.ts";
import { explainWorktreeSetupRefusal, runSetupCommand } from "../src/worktreeSetup.ts";
import { gitInitFixtureWithContent } from "./support/gitFixture.ts";
import { memoryLedger } from "./support/memoryLedger.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directories: string[] = [];

afterEach(() => {
  for (const directory of directories) {
    spawnSync("rm", ["-r", directory], { stdio: "ignore" });
  }
  directories = [];
});

function fixtureDir(): string {
  const directory = mkdtempSync(join(runsRoot, "setup-never-holds-"));
  directories.push(directory);
  return directory;
}

function script(directory: string, name: string, source: string): string {
  const path = join(directory, name);
  writeFileSync(path, source);
  return path;
}

function command(path: string): string {
  return `${process.execPath} ${path}`;
}

function fakeMise(directory: string): string {
  const path = script(directory, "mise", '#!/bin/sh\nshift 3\nexec "$@"\n');
  chmodSync(path, 0o755);
  return path;
}

function waitFor(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

describe("commands never hold the machine for a person", () => {
  it("closes stdin and adds the runner-owned non-interactive environment", async () => {
    const root = fixtureDir();
    const mise = fakeMise(root);
    gitInitFixtureWithContent(root);
    const resultFile = join(root, "result.json");
    const probe = script(
      root,
      "stdin-env.mjs",
      [
        "import { writeFileSync } from 'node:fs';",
        "let input = '';",
        "process.stdin.setEncoding('utf8');",
        "process.stdin.on('data', (chunk) => { input += chunk; });",
        "process.stdin.on('end', () => {",
        "  writeFileSync(process.env.RESULT, JSON.stringify({ input, ci: process.env.CI, purge: process.env.npm_config_confirm_modules_purge }));",
        "  process.exit(input.length === 0 ? 0 : 1);",
        "});",
        "",
      ].join("\n"),
    );

    const result = await runSetupCommand(
      command(probe),
      root,
      { ...process.env, RESULT: resultFile, CI: "0", npm_config_confirm_modules_purge: "true" },
      [mise],
    );

    if (isErr(result)) throw new Error(explainWorktreeSetupRefusal(result.error));
    expect(JSON.parse(readFileSync(resultFile, "utf8"))).toEqual({
      input: "",
      ci: "1",
      purge: "false",
    });
  });

  it("times out setup, terminates its grandchild, and retains the last output", async () => {
    const root = fixtureDir();
    const mise = fakeMise(root);
    gitInitFixtureWithContent(root);
    const pidFile = join(root, "grandchild.pid");
    const grandchild = script(root, "grandchild.mjs", "setInterval(() => {}, 1000);\n");
    const parent = script(
      root,
      "parent.mjs",
      [
        "import { spawn } from 'node:child_process';",
        "import { writeFileSync } from 'node:fs';",
        "const child = spawn(process.execPath, [process.env.GRANDCHILD], { stdio: 'ignore' });",
        "writeFileSync(process.env.PID_FILE, String(child.pid));",
        "process.stdout.write('setup still waiting\\n');",
        "process.on('SIGTERM', () => child.kill('SIGTERM'));",
        "setInterval(() => {}, 1000);",
        "",
      ].join("\n"),
    );

    const result = await runSetupCommand(
      command(parent),
      root,
      { ...process.env, GRANDCHILD: grandchild, PID_FILE: pidFile },
      [mise],
      undefined,
      200,
    );

    expect(isErr(result)).toBe(true);
    if (!isErr(result) || result.error.kind !== "command-failed") return;
    expect(result.error.timeoutMs).toBe(200);
    const explanation = explainWorktreeSetupRefusal(result.error);
    expect(explanation).toContain(`"${command(parent)}" timed out after 200ms.`);
    expect(explanation).toContain("setup still waiting");
    expect(explanation).toContain("setup output kept at");
    const pid = Number(readFileSync(pidFile, "utf8"));
    await waitFor(100);
    expect(() => process.kill(pid, 0)).toThrow();
  });

  it("releases a heavy-prefix lock when setup times out", async () => {
    const root = fixtureDir();
    const lock = join(root, "heavy.lock");
    const prefix = script(
      root,
      "heavy-prefix.mjs",
      [
        "#!/bin/sh",
        'mkdir "$LOCK"',
        "trap 'rmdir \"$LOCK\"; exit 143' TERM INT",
        "shift 3",
        '"$@"',
        "status=$?",
        'rmdir "$LOCK"',
        "exit $status",
        "",
      ].join("\n"),
    );
    chmodSync(prefix, 0o755);
    const waiting = script(root, "waiting.mjs", "setInterval(() => {}, 1000);\n");

    const result = await runSetupCommand(
      command(waiting),
      root,
      { ...process.env, LOCK: lock },
      [prefix],
      undefined,
      200,
    );

    expect(isErr(result)).toBe(true);
    await waitFor(100);
    expect(existsSync(lock)).toBe(false);
    expect(existsSync(join(root, "machine.yaml"))).toBe(false);
    expect(existsSync(join(root, "wrapper-ran"))).toBe(false);
  });

  it("blocks a gate timeout as a command failure, not a busy hold", async () => {
    const root = fixtureDir();
    const mise = fakeMise(root);
    gitInitFixtureWithContent(root);
    const waiting = script(
      root,
      "gate-waiting.mjs",
      "console.log('gate still waiting'); setInterval(() => {}, 1000);\n",
    );
    const ledger = memoryLedger();
    const narrated: string[] = [];

    const judged = await judgeGates({
      ledger,
      clock: createControlledClock(),
      node: { graph: "fixture", id: "setup-never-holds" },
      session: "session",
      declaredGateIds: ["slow-gate"],
      commandFor: new Map([["slow-gate", { kind: "command", run: command(waiting) }]]),
      worktree: root,
      scopeRoot: root,
      scopePaths: [],
      commitSha: "deadbeef",
      runnerId: "runner",
      holdMs: 60_000,
      holdTimeoutMs: 200,
      substrate: noneClient(),
      env: process.env,
      heavy: [mise],
      narrate: (line) => narrated.push(line),
    });

    expect(isErr(judged)).toBe(false);
    if (isErr(judged)) return;
    expect(judged.value.kind).toBe("held");
    if (judged.value.kind !== "held") return;
    expect(judged.value.on).toEqual({
      kind: "gate-failure",
      failure: "slow-gate",
      disposition: "hold",
    });
    expect(narrated.some((line) => line.includes('gate command "'))).toBe(true);
    expect(narrated.some((line) => line.includes("timed out after 200ms"))).toBe(true);
    const gate = ledger
      .projection()
      .nodes.get(nodeKey({ graph: "fixture", id: "setup-never-holds" }))
      ?.gates.get("slow-gate");
    expect(gate?.kind).toBe("blocked");
    if (gate?.kind !== "blocked") return;
    expect(gate.because).toContain("timed out after 200ms");
  });
});

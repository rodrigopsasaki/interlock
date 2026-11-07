import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { ok, unwrap } from "@phyxiusjs/fp";
import { createLedger, sessionRuntime } from "ledger";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runInterlockJudge } from "../src/judge.ts";

vi.mock("face", async (original) => ({
  ...(await original<typeof import("face")>()),
  approvalState: () => "approved",
  currentCommitSha: async () => "a".repeat(40),
  sharedJournalDirectory: async (root: string) => join(root, "journal"),
}));
vi.mock("../../runner/src/worktree.ts", async (original) => ({
  ...(await original<typeof import("../../runner/src/worktree.ts")>()),
  uncommittedPaths: () => ok([]),
}));
vi.mock("../../runner/src/scope.ts", () => ({ gitTrackedFiles: () => [] }));

const clock = createControlledClock({ initialTime: 0 });
let root = "";
let machine = "";
let output = "";
beforeEach(() => {
  const runs = join(import.meta.dirname, ".runs");
  mkdirSync(runs, { recursive: true });
  root = mkdtempSync(join(runs, "judge-provider-"));
  machine = join(root, "machine.yaml");
  output = join(root, "proof.json");
  vi.stubEnv("INTERLOCK_MACHINE", machine);
  mkdirSync(join(root, ".interlock", "graphs"), { recursive: true });
  mkdirSync(join(root, "worktrees", "n"), { recursive: true });
  writeFileSync(
    join(root, ".interlock", "local.yaml"),
    "interlock: local@v0\nruntime:\n  kind: fixture\n  args: []\nworktree_root: worktrees\nlease_ms: 1000\nrun_timeout_ms: 1000\nsubstrate:\n  address: none\n",
  );
  writeFileSync(
    join(root, ".interlock", "config.yaml"),
    "interlock: config@v0\nstanding_gates: []\n",
  );
  const child = join(root, "gate.cjs");
  writeFileSync(
    child,
    `require('node:fs').writeFileSync(${JSON.stringify(output)},JSON.stringify({limit:process.env.PROVIDER_LIMIT,wrapped:process.env.PROVIDER_WRAPPED}));`,
  );
  writeFileSync(
    join(root, ".interlock", "graphs", "g.yaml"),
    `interlock: graph@v0\nid: g\nnodes:\n  - id: n\n    depends_on: []\n    gates:\n      - id: proof\n        kind: command\n        run: ${process.execPath} ${child}\n`,
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true });
});
async function session() {
  const ledger = unwrap(await createLedger({ clock, directory: join(root, "journal") }));
  ledger.append({
    kind: "session-started",
    session: { id: "s", node: { graph: "g", id: "n" }, runtime: sessionRuntime.unknown() },
    brief: {
      graph: "g",
      node: "n",
      role: "implementer",
      acceptance: "fixture",
      gates: ["proof"],
      scope: [],
    },
  });
  await ledger.close();
}
function provider(envBody: string) {
  const env = join(root, "env.cjs");
  const heavy = join(root, "heavy.cjs");
  writeFileSync(env, envBody);
  writeFileSync(
    heavy,
    `const {spawnSync}=require('node:child_process');const r=spawnSync(process.argv[2],process.argv.slice(3),{stdio:'inherit',env:{...process.env,PROVIDER_WRAPPED:'yes'}});process.exit(r.status ?? 1);`,
  );
  writeFileSync(
    machine,
    JSON.stringify({
      interlock: "machine@v0",
      provider: {
        admit: ["false"],
        release: ["false"],
        env: [process.execPath, env],
        heavy: [process.execPath, heavy],
      },
    }),
  );
}

describe("standalone judge machine provider", () => {
  it("refuses a missing machine before creating a ledger", async () => {
    const result = await runInterlockJudge(["g", "n"], { cwd: root, clock, narrate: () => {} });
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("no machine provider is configured");
    expect(existsSync(join(root, "journal"))).toBe(false);
    expect(existsSync(output)).toBe(false);
  });
  it("refuses bad env before any ledger write", async () => {
    provider("process.stdout.write('[]');");
    const result = await runInterlockJudge(["g", "n"], { cwd: root, clock, narrate: () => {} });
    expect(result.message).toContain("provider.env");
    expect(existsSync(join(root, "journal"))).toBe(false);
  });
  it("runs the actual judge gate through heavy with provider env", async () => {
    provider(`process.stdout.write(JSON.stringify({PROVIDER_LIMIT:'a value with "quotes"'}));`);
    await session();
    const result = await runInterlockJudge(["g", "n"], { cwd: root, clock, narrate: () => {} });
    expect(result).toEqual({ exitCode: 0, message: "n: cleared (session s, judged by hand)" });
    expect(JSON.parse(readFileSync(output, "utf8"))).toEqual({
      limit: 'a value with "quotes"',
      wrapped: "yes",
    });
  });
  it("leaves gates unchanged with provider none", async () => {
    writeFileSync(machine, "interlock: machine@v0\nprovider: none\n");
    await session();
    expect(
      (await runInterlockJudge(["g", "n"], { cwd: root, clock, narrate: () => {} })).exitCode,
    ).toBe(0);
    expect(JSON.parse(readFileSync(output, "utf8"))).toEqual({});
  });
});

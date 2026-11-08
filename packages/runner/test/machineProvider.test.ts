import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { err, isErr, ok, unwrap } from "@phyxiusjs/fp";
import { createLedger, type Ledger } from "ledger";
import { noneClient } from "substrate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backfillGraph } from "../src/backfill.ts";
import { judgeGates } from "../src/gateJudge.ts";
import { herdrRuntime } from "../src/herdr/adapter.ts";
import {
  admitMachine,
  closeMachinePane,
  type MachineHold,
  machineDelivery,
  machineIntent,
  reconcileMachine,
  reconcileMachineOnStart,
} from "../src/machineOutbox.ts";
import { NO_MACHINE_PROVIDER, resolveMachine } from "../src/machineProvider.ts";
import type { Runtime } from "../src/runtime.ts";
import { type DriveSessionRequest, driveInteractiveSession } from "../src/sessionDrive.ts";
import { runWorktreeSetup } from "../src/worktreeSetup.ts";

vi.mock("face", async (original) => ({
  ...(await original<typeof import("face")>()),
  currentCommitSha: async () => "a".repeat(40),
  sharedJournalDirectory: async (root: string) => join(root, "journal"),
}));
vi.mock("../src/scope.ts", () => ({ gitScope: () => [], gitTrackedFiles: () => [] }));
vi.mock("../src/worktree.ts", async (original) => ({
  ...(await original<typeof import("../src/worktree.ts")>()),
  ensureNodeWorktree: (_root: string, path: string, base: string) => {
    mkdirSync(path, { recursive: true });
    return ok({ kind: "created", path, base });
  },
  createDetachedWorktree: (_root: string, path: string) => {
    mkdirSync(path, { recursive: true });
    return ok(undefined);
  },
  removeWorktree: () => ok(undefined),
  commitBriefIfChanged: () => ok(undefined),
  uncommittedPaths: () => ok([]),
  baseHoldsGraph: () => ok(undefined),
}));

const runs = join(import.meta.dirname, ".runs");
let root = "";
let machineFile = "";
let log = "";
let ledgers: Ledger[] = [];
const clock = createControlledClock({ initialTime: 0 });

beforeEach(() => {
  mkdirSync(runs, { recursive: true });
  root = mkdtempSync(join(runs, "machine-"));
  machineFile = join(root, "machine.yaml");
  log = join(root, "provider.log");
  vi.stubEnv("INTERLOCK_MACHINE", machineFile);
});
afterEach(async () => {
  for (const ledger of ledgers) await ledger.close();
  ledgers = [];
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true });
});

function script(name: string, body: string): string {
  const path = join(root, name);
  writeFileSync(path, body);
  return path;
}

function provider(
  envOutput = JSON.stringify({ LIMIT: 'space and "quote"', SECOND: "line\nslash\\end" }),
  envCode = 0,
) {
  const command = script(
    "provider.cjs",
    `
const fs = require('node:fs');
const [op, ...args] = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify([op, ...args]) + '\\n');
if (op === 'env') { process.stdout.write(${JSON.stringify(envOutput)}); process.exit(${envCode}); }
if (op === 'admit' && fs.existsSync(${JSON.stringify(join(root, "refuse"))})) { console.log('machine is full'); console.log('detail'); process.exit(7); }
if (op === 'release') { const file = ${JSON.stringify(join(root, "released"))}; const seen = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : []; if (!seen.includes(args[0])) { seen.push(args[0]); fs.writeFileSync(file, JSON.stringify(seen)); } }
`,
  );
  const value = {
    interlock: "machine@v0",
    provider: {
      env: [process.execPath, command, "env"],
      admit: [
        process.execPath,
        command,
        "admit",
        "{holder}",
        "{token}",
        "{pid}",
        "{pane}",
        "{workspace}",
        "{agent}",
        "{worktree}",
        "{attempt}",
      ],
      release: [process.execPath, command, "release", "{token}"],
      heavy: [
        process.execPath,
        script(
          "heavy.cjs",
          `const fs=require('node:fs'); const {spawnSync}=require('node:child_process'); fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(['heavy',...process.argv.slice(2)])+'\\n'); if (process.argv.at(-3)==='pnpm' && process.argv.at(-2)==='install') { fs.writeFileSync(${JSON.stringify(join(root, "install-env"))}, JSON.stringify({LIMIT:process.env.LIMIT})); process.exit(0); } const r=spawnSync(process.argv[2],process.argv.slice(3),{stdio:'inherit',env:process.env}); process.exit(r.status ?? 1);`,
        ),
      ],
    },
  };
  writeFileSync(machineFile, JSON.stringify(value));
  return value;
}
function lines(): unknown[] {
  return existsSync(log)
    ? readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .map((line): unknown => JSON.parse(line))
    : [];
}
async function ledgerAt(directory = join(root, "ledger")) {
  const ledger = unwrap(await createLedger({ clock, directory }));
  ledgers.push(ledger);
  return ledger;
}
function runtimeFixture() {
  let pid: number | undefined = 1234;
  let closeFails = false;
  const calls: string[] = [];
  const args: (readonly string[])[] = [];
  const environments: (Readonly<Record<string, string>> | undefined)[] = [];
  const runtime: Runtime = {
    paneEnvironment: true,
    openPane: async (_cwd, env) => {
      calls.push("open");
      environments.push(env);
      return ok({ id: "pane", workspace: "workspace" });
    },
    paneProcess: async () => {
      calls.push("pid");
      return ok({ state: "present", pid });
    },
    startAgent: async (pane, kind, argv) => {
      calls.push("start");
      args.push(argv);
      if (kind === "kimi") {
        const result = spawnSync(
          process.execPath,
          [
            script(
              "kimi.cjs",
              `require('node:fs').writeFileSync(${JSON.stringify(join(root, "agent-env"))}, JSON.stringify({LIMIT:process.env.LIMIT,SECOND:process.env.SECOND}));`,
            ),
          ],
          { env: { ...process.env, ...environments[0] } },
        );
        expect(result.status).toBe(0);
      }
      return ok({ id: "agent", pane });
    },
    reportIdentity: async () => err({ kind: "transport", because: "fixture stops after launch" }),
    prompt: async () => ok(undefined),
    waitUntil: async () => ok("idle"),
    read: async () => ok(""),
    sendKeys: async () => ok(undefined),
    sendPaneKeys: async () => ok(undefined),
    closePane: async () => {
      calls.push("close");
      return closeFails ? err({ kind: "transport", because: "close failed" }) : ok(undefined);
    },
  };
  return {
    runtime,
    calls,
    args,
    environments,
    noPid: () => {
      pid = undefined;
    },
    failClose: () => {
      closeFails = true;
    },
  };
}
async function launch(
  runtime: Runtime,
  kind = "codex",
  ledger?: Ledger,
  setup: readonly string[] = [],
) {
  const narrated: string[] = [];
  const request: DriveSessionRequest = {
    repoRoot: root,
    graph: "g",
    node: "n",
    role: "implementer",
    acceptance: "fixture",
    nodeGates: [],
    localConfig: {
      runtime: {
        kind,
        args: [],
        startupAnswers: [],
        startupTimeoutMs: 1,
        promptTakenTimeoutMs: 1,
        readySettleMs: 0,
        promptRetries: 0,
        writableRootArgs: undefined,
      },
      worktreeRoot: "worktrees",
      worktreeSetup: setup,
      leaseMs: 900000,
      runTimeoutMs: 1,
      answerGraceMs: 0,
      substrateAddress: "none",
      substrateSendRepository: false,
    },
    agentRuntime: {
      name: "fixture",
      kind,
      model: "fixture",
      source: "catalogue",
      commits: "agent",
      args: [],
      startupAnswers: [],
      startupTimeoutMs: 1,
      promptTakenTimeoutMs: 1,
      readySettleMs: 0,
      promptRetries: 0,
      writableRootArgs: undefined,
    },
    standingGates: [],
    substrate: noneClient(),
    ledger: ledger ?? (await ledgerAt()),
    clock,
    narrate: (line) => narrated.push(line),
    runtime,
    runnerIdPrefix: "test",
    composeBrief: async (worktree) => ok({ path: join(worktree, "brief.md"), narration: [] }),
  };
  const result = await driveInteractiveSession(request);
  return { result, narrated, ledger: request.ledger };
}
function hold(command: string): MachineHold {
  return {
    token: "session/pane",
    pane: "pane",
    cwd: root,
    env: {},
    release: [process.execPath, command, "release", "session/pane"],
  };
}

describe("machine provider", () => {
  it("refuses absent configuration before setup or any session event", async () => {
    const runtime = runtimeFixture();
    const result = await launch(runtime.runtime);
    expect(result.result).toEqual({ exitCode: 1, message: NO_MACHINE_PROVIDER });
    expect(result.narrated).toEqual([NO_MACHINE_PROVIDER]);
    expect(result.ledger.projection().sessions.size).toBe(0);
    expect(existsSync(join(root, "worktrees"))).toBe(false);
    expect(runtime.calls).toEqual([]);
  });
  it("keeps provider none behavior and narrates it once", async () => {
    writeFileSync(machineFile, "interlock: machine@v0\nprovider: none\n");
    const runtime = runtimeFixture();
    const result = await launch(runtime.runtime);
    const sessionView = [...result.ledger.projection().sessions.values()][0];
    expect(runtime.calls).toEqual(["open", "start", "close"]);
    expect(runtime.args).toEqual([
      expect.arrayContaining([
        expect.stringContaining("shell_environment_policy.set.INTERLOCK_SESSION"),
        expect.stringContaining("shell_environment_policy.set.INTERLOCK_GRAPH"),
        expect.stringContaining("shell_environment_policy.set.INTERLOCK_NODE"),
      ]),
    ]);
    expect(runtime.environments).toEqual([
      expect.objectContaining({
        INTERLOCK_SESSION: sessionView?.session,
        INTERLOCK_GRAPH: "g",
        INTERLOCK_NODE: "n",
      }),
    ]);
    expect(result.narrated.filter((line) => line.includes("no machine provider"))).toHaveLength(1);
    expect(sessionView?.narration.map((entry) => entry.line)).toEqual(result.narrated);
    expect(result.ledger.projection().outbox.size).toBe(0);
  });
  it.each(["admit", "release", "env", "heavy"])(
    "refuses a missing %s before setup",
    async (key) => {
      const value = provider();
      const fields: Record<string, unknown> = { ...value.provider };
      delete fields[key];
      writeFileSync(machineFile, JSON.stringify({ interlock: "machine@v0", provider: fields }));
      const result = await launch(runtimeFixture().runtime);
      expect(result.result.message).toContain(`provider.${key}`);
      expect(result.ledger.projection().sessions.size).toBe(0);
      expect(existsSync(join(root, "worktrees"))).toBe(false);
      expect(lines()).toEqual([]);
    },
  );
  it.each([
    "[bad",
    "interlock: machine@v0\nprovider: {admit: nope}",
    "interlock: machine@v9\nprovider: none",
  ])("refuses malformed machine %s", async (raw) => {
    writeFileSync(machineFile, raw);
    const result = await launch(runtimeFixture().runtime);
    expect(result.result.exitCode).toBe(1);
    expect(result.result.message).toMatch(/machine/);
    expect(existsSync(join(root, "worktrees"))).toBe(false);
  });
  it.each([
    ["[]", 0],
    ['{"value":1}', 0],
    ["not json", 0],
    ["{}", 8],
  ])("refuses bad env %s at exit %i before setup or admission", async (output, code) => {
    provider(output, code);
    const result = await launch(runtimeFixture().runtime);
    expect(result.result.message).toContain("provider.env");
    expect(existsSync(join(root, "worktrees"))).toBe(false);
    expect(lines()).toEqual([["env"]]);
  });
  it("admits only between pane open and agent start, substituting holder, token and pid", async () => {
    provider();
    const runtime = runtimeFixture();
    const original = runtime.runtime.startAgent;
    const result = await launch({
      ...runtime.runtime,
      startAgent: async (...args) => {
        expect(runtime.calls).toEqual(["open", "pid"]);
        expect(lines()).toContainEqual(
          expect.arrayContaining([
            "admit",
            expect.stringMatching(/^g\/n \(/),
            expect.stringMatching(/\/pane$/),
            "1234",
            "pane",
            "workspace",
            "fixture",
          ]),
        );
        return original(...args);
      },
    });
    expect(runtime.calls).toEqual(["open", "pid", "start", "close"]);
    const session = [...result.ledger.projection().sessions.keys()][0];
    if (session === undefined) return;
    expect(lines()).toContainEqual(["release", `${session}/pane`]);
    expect(runtime.args[0]).toEqual(expect.arrayContaining(["--profile"]));
  });
  it("returns the refused provider line verbatim, closes without outcome and succeeds on retry", async () => {
    provider();
    writeFileSync(join(root, "refuse"), "");
    const runtime = runtimeFixture();
    const ledger = await ledgerAt();
    const first = await launch(runtime.runtime, "codex", ledger);
    expect(first.result).toEqual({ exitCode: 1, message: "machine is full" });
    expect(runtime.calls).toEqual(["open", "pid", "close"]);
    expect(
      [...ledger.projection().nodes.values()].every((node) => node.outcome === undefined),
    ).toBe(true);
    rmSync(join(root, "refuse"));
    await launch(runtime.runtime, "codex", ledger);
    expect(runtime.calls).toContain("start");
  });
  it("refuses a missing pid and keeps a failed close held without release", async () => {
    provider();
    const noPid = runtimeFixture();
    noPid.noPid();
    expect((await launch(noPid.runtime)).result.message).toContain("no pane process pid");
    expect(noPid.calls).toEqual(["open", "pid", "close"]);
    const runtime = runtimeFixture();
    runtime.failClose();
    const result = await launch(runtime.runtime);
    expect(result.result.message).toContain("hold kept");
    expect(
      [...result.ledger.projection().nodes.values()].some((node) => node.outcome?.kind === "held"),
    ).toBe(true);
    expect(lines().some((entry) => Array.isArray(entry) && entry[0] === "release")).toBe(false);
  });
  it("passes environment to a kimi-shaped fixture process and fails closed without pane env support", async () => {
    provider();
    await launch(runtimeFixture().runtime, "kimi");
    expect(JSON.parse(readFileSync(join(root, "agent-env"), "utf8"))).toEqual({
      LIMIT: 'space and "quote"',
      SECOND: "line\nslash\\end",
    });
    const runtime = runtimeFixture();
    const result = await launch({ ...runtime.runtime, paneEnvironment: false }, "kimi");
    expect(result.result.message).toContain("cannot reach this agent");
    expect(runtime.calls).toEqual([]);
  });
  it("reconciles a successful admit lost to a crash by closing the orphan before releasing once", async () => {
    const configured = provider();
    const held = hold(configured.provider.release[1] ?? "");
    const directory = join(root, "restart-ledger");
    const first = await ledgerAt(directory);
    expect(
      isErr(
        await admitMachine(first, { graph: "g", id: "n" }, "session", held, [
          process.execPath,
          configured.provider.admit[1] ?? "",
          "admit",
        ]),
      ),
    ).toBe(false);
    await first.close();
    ledgers = ledgers.filter((entry) => entry !== first);
    const restarted = await ledgerAt(directory);
    const runtime = runtimeFixture();
    expect(await reconcileMachine(restarted, runtime.runtime, () => {}, clock)).toEqual(
      ok(undefined),
    );
    expect(runtime.calls).toEqual(["pid", "close"]);
    expect(await reconcileMachine(restarted, runtime.runtime, () => {}, clock)).toEqual(
      ok(undefined),
    );
    expect(lines().filter((entry) => Array.isArray(entry) && entry[0] === "release")).toEqual([
      ["release", "session/pane"],
    ]);
  });
  it("keeps orphan admission when process inspection or close is uncertain", async () => {
    const configured = provider();
    const held = hold(configured.provider.release[1] ?? "");
    const ledger = await ledgerAt();
    unwrap(machineIntent(ledger, { graph: "g", id: "n" }, "s", "admit", held));
    const runtime = runtimeFixture();
    runtime.failClose();
    const narrated: string[] = [];
    expect(
      isErr(await reconcileMachine(ledger, runtime.runtime, (line) => narrated.push(line), clock)),
    ).toBe(true);
    expect(narrated.join()).toContain("kept");
    expect(lines()).toEqual([]);
    expect(
      isErr(
        await reconcileMachine(
          ledger,
          {
            ...runtime.runtime,
            paneProcess: async () => err({ kind: "transport", because: "unknown pane state" }),
          },
          () => {},
          clock,
        ),
      ),
    ).toBe(true);
    expect(lines()).toEqual([]);
  });
  it("resends an uncertain release after a crash after confirmed close, idempotently per token", async () => {
    const configured = provider();
    const held = hold(configured.provider.release[1] ?? "");
    const directory = join(root, "restart-ledger");
    const ledger = await ledgerAt(directory);
    const original = ledger.appendConfirmed;
    let crashed = false;
    const crashLedger: Ledger = {
      ...ledger,
      appendConfirmed: (event) => {
        if (
          event.kind === "outbox-delivery-recorded" &&
          event.delivery.state === "acknowledged" &&
          ledger.projection().outbox.get(event.delivery.id)?.intent.target ===
            "machine-provider/release"
        ) {
          crashed = true;
          return err({ because: "crash" });
        }
        return original(event);
      },
    };
    // A refused journal acknowledgment models the process dying after release dispatch.
    expect(
      isErr(
        await closeMachinePane(
          crashLedger,
          runtimeFixture().runtime,
          { graph: "g", id: "n" },
          "s",
          held,
        ),
      ),
    ).toBe(true);
    expect(crashed).toBe(true);
    await ledger.close();
    ledgers = ledgers.filter((entry) => entry !== ledger);
    const restarted = await ledgerAt(directory);
    const runtime = runtimeFixture();
    expect(await reconcileMachine(restarted, runtime.runtime, () => {}, clock)).toEqual(
      ok(undefined),
    );
    expect(runtime.calls).toEqual([]);
    await reconcileMachine(restarted, runtime.runtime, () => {}, clock);
    expect(lines().filter((entry) => Array.isArray(entry) && entry[0] === "release")).toHaveLength(
      2,
    );
    expect(JSON.parse(readFileSync(join(root, "released"), "utf8"))).toEqual(["session/pane"]);
  });
  it("recovers pending effects on startup even when no new session is launched", async () => {
    const configured = provider();
    const held = hold(configured.provider.release[1] ?? "");
    const ledger = await ledgerAt();
    unwrap(machineIntent(ledger, { graph: "g", id: "n" }, "s", "admit", held));
    const runtime = runtimeFixture();
    unwrap(await reconcileMachineOnStart(ledger, clock, () => {}, runtime.runtime));
    expect(runtime.calls).toEqual(["pid", "close"]);
    expect(lines()).toEqual([["release", "session/pane"]]);
    unwrap(await reconcileMachineOnStart(ledger, clock, () => {}, runtime.runtime));
    expect(runtime.calls).toEqual(["pid", "close"]);
  });
  it("keeps intent before dispatch and dispatches nothing when intent persistence fails", async () => {
    const configured = provider();
    const held = hold(configured.provider.release[1] ?? "");
    const ledger = await ledgerAt();
    const refused: Ledger = { ...ledger, appendConfirmed: () => err({ because: "disk full" }) };
    expect(
      isErr(
        await admitMachine(refused, { graph: "g", id: "n" }, "s", held, [
          process.execPath,
          configured.provider.admit[1] ?? "",
          "admit",
        ]),
      ),
    ).toBe(true);
    expect(lines()).toEqual([]);
    const observe = script(
      "observe.cjs",
      `const fs=require('node:fs');const lines=fs.readFileSync(${JSON.stringify(join(root, "ledger", "journal.jsonl"))},'utf8');if(!lines.includes('machine-provider/admit'))process.exit(1);`,
    );
    unwrap(
      await admitMachine(ledger, { graph: "g", id: "n" }, "s", held, [process.execPath, observe]),
    );
    const runtime = runtimeFixture();
    await closeMachinePane(
      ledger,
      {
        ...runtime.runtime,
        closePane: async (pane) => {
          const pending = [...ledger.projection().outbox.values()];
          expect(
            pending.some(
              (view) =>
                view.intent.target === "machine-provider/close" && view.state === "uncertain",
            ),
          ).toBe(true);
          expect(
            pending.some(
              (view) =>
                view.intent.target === "machine-provider/release" && view.state === "uncertain",
            ),
          ).toBe(true);
          return runtime.runtime.closePane(pane);
        },
      },
      { graph: "g", id: "n" },
      "s",
      held,
    );
    expect(lines()).toEqual([["release", "session/pane"]]);
  });
  it("never releases an admitted pane retained for drilldown after agent start", async () => {
    const configured = provider();
    const held = hold(configured.provider.release[1] ?? "");
    const ledger = await ledgerAt();
    unwrap(machineIntent(ledger, { graph: "g", id: "n" }, "s", "admit", held));
    const started = unwrap(machineIntent(ledger, { graph: "g", id: "n" }, "s", "agent", held));
    unwrap(machineDelivery(ledger, started, ok({ agent: "agent" })));
    const runtime = runtimeFixture();
    unwrap(await reconcileMachine(ledger, runtime.runtime, () => {}, clock));
    expect(runtime.calls).toEqual([]);
    expect(lines()).toEqual([]);
  });
  it("releases a confirmed gone pane without dispatching a guessed close", async () => {
    const configured = provider();
    const held = hold(configured.provider.release[1] ?? "");
    const ledger = await ledgerAt();
    unwrap(machineIntent(ledger, { graph: "g", id: "n" }, "s", "admit", held));
    const runtime = runtimeFixture();
    await reconcileMachine(
      ledger,
      { ...runtime.runtime, paneProcess: async () => ok({ state: "gone" }) },
      () => {},
      clock,
    );
    expect(runtime.calls).toEqual([]);
    expect(lines()).toEqual([["release", "session/pane"]]);
  });
  it("refuses missing provider or failed env in backfill before worktree creation", async () => {
    const options = {
      repoRoot: root,
      mainBranch: "missing",
      document: { id: "g", nodes: [], gates: [] },
      ledger: await ledgerAt(),
      clock,
      standingGates: [],
      worktreeRoot: "worktrees",
    };
    expect(isErr(await backfillGraph(options))).toBe(true);
    expect(existsSync(join(root, "worktrees"))).toBe(false);
    provider("{}", 1);
    expect(isErr(await backfillGraph(options))).toBe(true);
    expect(existsSync(join(root, "worktrees"))).toBe(false);
  });
  it("prefixes setup and a gate with heavy and merges the environment", async () => {
    provider();
    const machine = unwrap(await resolveMachine(root));
    const output = join(root, "setup-env");
    const child = script(
      "setup.cjs",
      `require('node:fs').writeFileSync(${JSON.stringify(output)},process.env.LIMIT);`,
    );
    unwrap(
      await runWorktreeSetup(
        [`${process.execPath} ${child}`],
        root,
        () => {},
        { ...process.env, ...machine.env },
        machine.heavy,
      ),
    );
    expect(readFileSync(output, "utf8")).toBe('space and "quote"');
    const ledger = await ledgerAt();
    unwrap(
      await judgeGates({
        ledger,
        clock,
        node: { graph: "g", id: "n" },
        session: "s",
        declaredGateIds: ["proof"],
        commandFor: new Map([["proof", { kind: "command", run: `${process.execPath} ${child}` }]]),
        worktree: root,
        scopeRoot: root,
        scopePaths: [],
        commitSha: "a".repeat(40),
        runnerId: "r",
        holdMs: 1,
        substrate: noneClient(),
        env: { ...process.env, ...machine.env },
        heavy: machine.heavy,
        narrate: () => {},
      }),
    );
    expect(lines().filter((entry) => Array.isArray(entry) && entry[0] === "heavy")).toHaveLength(2);
  });
  it("persists an uncertain release before close so a crash between close and release is recovered once", async () => {
    const configured = provider();
    const held = hold(configured.provider.release[1] ?? "");
    const directory = join(root, "restart-ledger");
    const ledger = await ledgerAt(directory);
    const crashLedger: Ledger = {
      ...ledger,
      appendConfirmed: (event) => {
        const saved = ledger.appendConfirmed(event);
        if (
          event.kind === "outbox-delivery-recorded" &&
          event.delivery.state === "acknowledged" &&
          ledger.projection().outbox.get(event.delivery.id)?.intent.target ===
            "machine-provider/close"
        )
          throw new Error("crash after close");
        return saved;
      },
    };
    await expect(
      closeMachinePane(crashLedger, runtimeFixture().runtime, { graph: "g", id: "n" }, "s", held),
    ).rejects.toThrow("crash after close");
    expect(
      [...ledger.projection().outbox.values()].find(
        (view) => view.intent.target === "machine-provider/release",
      )?.state,
    ).toBe("uncertain");
    expect(lines()).toEqual([]);
    await ledger.close();
    ledgers = ledgers.filter((entry) => entry !== ledger);
    const restarted = await ledgerAt(directory);
    unwrap(await reconcileMachine(restarted, runtimeFixture().runtime, () => {}, clock));
    unwrap(await reconcileMachine(restarted, runtimeFixture().runtime, () => {}, clock));
    expect(lines()).toEqual([["release", "session/pane"]]);
  });
  it("runs backfill install through heavy with the same environment", async () => {
    provider();
    const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
    const options = {
      repoRoot,
      mainBranch: "HEAD",
      document: { id: "g", nodes: [], gates: [] },
      ledger: await ledgerAt(),
      clock,
      standingGates: [],
      worktreeRoot: relative(repoRoot, join(root, "worktrees")),
    };
    unwrap(await backfillGraph(options));
    expect(lines()).toContainEqual([
      "heavy",
      "mise",
      "exec",
      "--",
      "pnpm",
      "install",
      "--config.confirmModulesPurge=false",
    ]);
    expect(JSON.parse(readFileSync(join(root, "install-env"), "utf8"))).toEqual({
      LIMIT: 'space and "quote"',
    });
  });
  it("two runner requests share a heavy prefix that serializes their setup and gate", async () => {
    const events = join(root, "heavy-events");
    const lock = join(root, "heavy-lock");
    const prefix = script(
      "serial-heavy.cjs",
      `
const fs=require('node:fs'); const {spawnSync}=require('node:child_process');
while (true) { try { fs.mkdirSync(${JSON.stringify(lock)}); break; } catch(e) { if(e.code!=='EEXIST') throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5); } }
try { fs.appendFileSync(${JSON.stringify(events)},'start\\n'); const r=spawnSync(process.argv[2],process.argv.slice(3),{stdio:'inherit'}); if(r.status!==0) process.exitCode=1; }
finally { fs.appendFileSync(${JSON.stringify(events)},'end\\n'); fs.rmdirSync(${JSON.stringify(lock)}); }
`,
    );
    const child = script(
      "slow.cjs",
      "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25);",
    );
    const heavy = [process.execPath, prefix];
    const ledger = await ledgerAt();
    const results = await Promise.all([
      runWorktreeSetup([`${process.execPath} ${child}`], root, () => {}, process.env, heavy),
      judgeGates({
        ledger,
        clock,
        node: { graph: "g", id: "n" },
        session: "s",
        declaredGateIds: ["proof"],
        commandFor: new Map([["proof", { kind: "command", run: `${process.execPath} ${child}` }]]),
        worktree: root,
        scopeRoot: root,
        scopePaths: [],
        commitSha: "a".repeat(40),
        runnerId: "r",
        holdMs: 1,
        substrate: noneClient(),
        heavy,
        narrate: () => {},
      }),
    ]);
    for (const result of results) expect(result._tag).toBe("Ok");
    expect(readFileSync(events, "utf8")).toBe("start\nend\nstart\nend\n");
  });
  it("propagates tab inspection and tab close failures from the adapter close", async () => {
    for (const fail of ["tab.get", "tab.close"]) {
      const runtime = herdrRuntime(async (method) => {
        if (method === fail)
          return err({ kind: "transport", because: "cannot inspect or close tab" });
        if (method === "workspace.list") return ok({ workspaces: [] });
        if (method === "workspace.create")
          return ok({ root_pane: { pane_id: "p" }, tab: { tab_id: "t" } });
        if (method === "tab.get") return ok({ tab: { pane_count: 0 } });
        return ok({});
      });
      const pane = unwrap(await runtime.openPane(root));
      expect(isErr(await runtime.closePane(pane))).toBe(true);
    }
  });
  it("uses pane process-info and forwards env through the adapter", async () => {
    const calls: { method: string; params: Readonly<Record<string, unknown>> }[] = [];
    const runtime = herdrRuntime(async (method, params) => {
      calls.push({ method, params });
      if (method === "workspace.list") return ok({ workspaces: [] });
      if (method === "workspace.create")
        return ok({
          root_pane: { pane_id: "p" },
          tab: { tab_id: "t" },
          workspace: { workspace_id: "w" },
        });
      if (method === "pane.list") return ok({ panes: [{ pane_id: "p" }] });
      if (method === "pane.process_info") return ok({ process_info: { shell_pid: 123 } });
      return ok({});
    });
    const pane = unwrap(await runtime.openPane(root, { LIMIT: "value" }));
    expect(await runtime.paneProcess?.(pane)).toEqual(ok({ state: "present", pid: 123 }));
    expect(calls).toContainEqual({
      method: "workspace.create",
      params: expect.objectContaining({ env: { LIMIT: "value" } }),
    });
  });
});

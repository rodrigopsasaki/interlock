import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { unwrap } from "@phyxiusjs/fp";
import { sharedJournalDirectory } from "face";
import { createLedger, sessionRuntime } from "ledger";
import { afterEach, describe, expect, it } from "vitest";
import { runRuntimeList } from "../src/runtime/list.ts";
import { gitInitFixture } from "./graph/gitFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;
const savedRuntimesEnv = process.env["INTERLOCK_RUNTIMES"];

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
  if (savedRuntimesEnv === undefined) delete process.env["INTERLOCK_RUNTIMES"];
  else process.env["INTERLOCK_RUNTIMES"] = savedRuntimesEnv;
});

// A fixture without its own `.git` would resolve sharedJournalDirectory to the real
// repository's own journal; runtime list now reads that journal for the last-attempt column.
function repoFixture(): string {
  directory = mkdtempSync(join(runsRoot, "runtime-list-"));
  mkdirSync(join(directory, ".interlock"), { recursive: true });
  gitInitFixture(directory);
  return directory;
}

function setCatalogue(repoRoot: string, contents: string): void {
  const path = join(repoRoot, "runtimes.yaml");
  writeFileSync(path, contents);
  process.env["INTERLOCK_RUNTIMES"] = path;
}

function setNoCatalogue(repoRoot: string): void {
  process.env["INTERLOCK_RUNTIMES"] = join(repoRoot, "does-not-exist.yaml");
}

function setLocalConfig(repoRoot: string, contents: string): void {
  writeFileSync(join(repoRoot, ".interlock", "local.yaml"), contents);
}

const validLocalYaml = [
  "interlock: local@v0",
  "runtime:",
  "  kind: claude",
  "  args: []",
  "worktree_root: .worktrees",
  "lease_ms: 900000",
  "run_timeout_ms: 3600000",
  "substrate:",
  "  address: none",
  "",
].join("\n");

describe("runtime list: an absent catalogue and no local.yaml", () => {
  it("prints one sentence saying there are no runtimes, naming that local.yaml is absent", async () => {
    const repoRoot = repoFixture();
    setNoCatalogue(repoRoot);

    const result = await runRuntimeList([], { cwd: repoRoot });

    expect(result.exitCode).toBe(0);
    expect(result.message).toBe(
      "no runtimes declared; the catalogue is empty and local.yaml is absent.",
    );
  });
});

describe("runtime list: a valid catalogue", () => {
  it("renders one line per runtime with name, kind, model, source and never-run", async () => {
    const repoRoot = repoFixture();
    setCatalogue(
      repoRoot,
      [
        "interlock: runtimes@v0",
        "runtimes:",
        "  fast:",
        "    kind: claude",
        "    model: fast-model-label",
        "",
      ].join("\n"),
    );

    const result = await runRuntimeList([], { cwd: repoRoot });

    expect(result.exitCode).toBe(0);
    expect(result.message).toBe(
      "fast — kind claude, model fast-model-label, source catalogue, last attempt never run",
    );
  });

  it("includes the legacy runtime: block as the runtime named default", async () => {
    const repoRoot = repoFixture();
    setNoCatalogue(repoRoot);
    setLocalConfig(repoRoot, validLocalYaml);

    const result = await runRuntimeList([], { cwd: repoRoot });

    expect(result.exitCode).toBe(0);
    expect(result.message).toBe(
      "default — kind claude, model (none), source local.yaml, last attempt never run",
    );
  });

  it("lists catalogue entries and the legacy default together", async () => {
    const repoRoot = repoFixture();
    setCatalogue(
      repoRoot,
      [
        "interlock: runtimes@v0",
        "runtimes:",
        "  fast:",
        "    kind: codex",
        "    model: fast-model-label",
        "",
      ].join("\n"),
    );
    setLocalConfig(repoRoot, validLocalYaml);

    const result = await runRuntimeList([], { cwd: repoRoot });

    expect(result.exitCode).toBe(0);
    expect(result.message.split("\n")).toEqual([
      "fast — kind codex, model fast-model-label, source catalogue, last attempt never run",
      "default — kind claude, model (none), source local.yaml, last attempt never run",
    ]);
  });

  it("reads the last attempt on a named runtime from the shared journal: its session, outcome and when", async () => {
    const repoRoot = repoFixture();
    setCatalogue(
      repoRoot,
      [
        "interlock: runtimes@v0",
        "runtimes:",
        "  fast:",
        "    kind: claude",
        "    model: fast-model-label",
        "",
      ].join("\n"),
    );

    const clock = createControlledClock({ initialTime: 0 });
    const ledger = unwrap(
      await createLedger({
        clock,
        directory: sharedJournalDirectory(repoRoot),
      }),
    );
    const node = { graph: "demo", id: "a" };
    ledger.append({
      kind: "session-started",
      session: {
        id: "s1",
        node,
        runtime: sessionRuntime.declared("fast", "claude", "fast-model-label"),
      },
      brief: {
        graph: "demo",
        node: "a",
        role: "worker",
        acceptance: "fixture",
        gates: [],
        scope: [],
      },
    });
    ledger.append({
      kind: "lease-taken",
      node,
      session: "s1",
      expiry: 60_000,
    });
    ledger.append({
      kind: "session-narrated",
      session: "s1",
      at: 12_345,
      line: "leased a",
    });
    ledger.append({
      kind: "outcome-set",
      node,
      outcome: { kind: "cleared", receipts: [] },
    });
    await ledger.close();

    const result = await runRuntimeList([], { cwd: repoRoot });

    expect(result.exitCode).toBe(0);
    expect(result.message).toBe(
      "fast — kind claude, model fast-model-label, source catalogue, " +
        `last attempt s1 — cleared, ${new Date(12_345).toISOString()}`,
    );
  });
});

describe("runtime list: refusals bubble up as sentences", () => {
  it("refuses a malformed catalogue", async () => {
    const repoRoot = repoFixture();
    setCatalogue(repoRoot, "interlock: runtimes@v9\n");

    const result = await runRuntimeList([], { cwd: repoRoot });

    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("shape tag");
  });

  it("refuses a malformed local.yaml", async () => {
    const repoRoot = repoFixture();
    setNoCatalogue(repoRoot);
    setLocalConfig(repoRoot, "interlock: local@v0\n");

    const result = await runRuntimeList([], { cwd: repoRoot });

    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("runtime.kind");
  });

  it("refuses when the catalogue also declares a runtime named default", async () => {
    const repoRoot = repoFixture();
    setCatalogue(
      repoRoot,
      [
        "interlock: runtimes@v0",
        "runtimes:",
        "  default:",
        "    kind: codex",
        "    model: m",
        "",
      ].join("\n"),
    );
    setLocalConfig(repoRoot, validLocalYaml);

    const result = await runRuntimeList([], { cwd: repoRoot });

    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("default");
  });

  it("refuses when local.yaml's default_runtime names an unknown runtime", async () => {
    const repoRoot = repoFixture();
    setNoCatalogue(repoRoot);
    setLocalConfig(repoRoot, `${validLocalYaml}default_runtime: nope\n`);

    const result = await runRuntimeList([], { cwd: repoRoot });

    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("nope");
  });
});

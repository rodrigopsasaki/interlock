import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { delimiter, join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { isErr } from "@phyxiusjs/fp";
import { noneClient } from "substrate";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import type { GateCommand } from "../src/gateCommand.ts";
import { judgeGates } from "../src/gateJudge.ts";
import { runWorktreeSetup } from "../src/worktreeSetup.ts";
import { gitInitFixtureWithContent } from "./support/gitFixture.ts";
import { memoryLedger } from "./support/memoryLedger.ts";
import { allocateToolState } from "./support/toolState.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });
const toolState = allocateToolState("engines-node-mise");

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

afterAll(() => {
  toolState.cleanup();
});

function fixture(
  engine: string | undefined,
  nodeVersion: string,
): {
  readonly root: string;
  readonly env: NodeJS.ProcessEnv;
  readonly proof: string;
  readonly setup: string;
  readonly setupMarker: string;
} {
  const root = mkdtempSync(join(runsRoot, "engines-node-"));
  directory = root;
  const bin = join(root, "bin");
  mkdirSync(bin);
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify(
      engine === undefined ? { name: "fixture" } : { name: "fixture", engines: { node: engine } },
    ),
  );
  const node = join(bin, "node");
  writeFileSync(node, ["#!/bin/sh", "printf '%s\\n' \"$FIXTURE_NODE_VERSION\"", ""].join("\n"));
  chmodSync(node, 0o755);
  const proof = join(bin, "proof");
  writeFileSync(proof, "#!/bin/sh\nprintf 'proof-ran\\n'\n");
  chmodSync(proof, 0o755);
  const setupMarker = join(root, "setup-ran");
  const setup = join(bin, "setup");
  writeFileSync(
    setup,
    ["#!/bin/sh", "printf 'setup-ran\\n' > \"$FIXTURE_SETUP_MARKER\"", ""].join("\n"),
  );
  chmodSync(setup, 0o755);
  gitInitFixtureWithContent(root);
  return {
    root,
    env: {
      ...process.env,
      PATH: [bin, process.env["PATH"] ?? ""].join(delimiter),
      FIXTURE_NODE_VERSION: nodeVersion,
      FIXTURE_SETUP_MARKER: setupMarker,
      MISE_STATE_DIR: toolState.environment["MISE_STATE_DIR"],
    },
    proof,
    setup,
    setupMarker,
  };
}

async function judge(root: string, env: NodeJS.ProcessEnv, proof: string, narrate: string[]) {
  return judgeGates({
    ledger: memoryLedger(),
    clock: createControlledClock(),
    node: { graph: "fixture", id: "node" },
    session: "session",
    declaredGateIds: ["proof"],
    commandFor: new Map<string, GateCommand>([["proof", { kind: "command", run: proof }]]),
    worktree: root,
    scopeRoot: root,
    scopePaths: ["package.json", "bin/node", "bin/proof"],
    commitSha: "a".repeat(40),
    runnerId: "runner",
    holdMs: 60_000,
    substrate: noneClient(),
    env: { ...toolState.environment, ...env },
    narrate: (line) => narrate.push(line),
  });
}

describe("gates and worktree setup respect engines.node", () => {
  it("holds an exact-version mismatch before spawning the gate", async () => {
    const current = fixture("24.14.0", "v26.13.0");
    const narrate: string[] = [];

    const result = await judge(current.root, current.env, current.proof, narrate);

    expect(isErr(result)).toBe(false);
    if (isErr(result)) return;
    expect(result.value.kind).toBe("held");
    expect(narrate).toContain(
      `gate node v26.13.0 at ${join(current.root, "bin", "node")} is outside engines 24.14.0`,
    );
  });

  it("runs an exact-version match", async () => {
    const current = fixture("24.14.0", "v24.14.0");
    const narrate: string[] = [];

    const result = await judge(current.root, current.env, current.proof, narrate);

    expect(isErr(result)).toBe(false);
    if (isErr(result)) return;
    expect(result.value.kind).toBe("cleared");
  });

  it.each([
    ["v24.9.0", true],
    ["v25.0.0", false],
    ["v23.11.0", false],
  ])("checks a space-joined range against %s", async (nodeVersion, runs) => {
    const current = fixture(">=24 <25", nodeVersion);
    const narrate: string[] = [];

    const result = await judge(current.root, current.env, current.proof, narrate);

    expect(isErr(result)).toBe(false);
    if (isErr(result)) return;
    expect(result.value.kind === "cleared").toBe(runs);
  });

  it("runs when engines.node is absent", async () => {
    const current = fixture(undefined, "v26.13.0");
    const narrate: string[] = [];

    const result = await judge(current.root, current.env, current.proof, narrate);

    expect(isErr(result)).toBe(false);
    if (isErr(result)) return;
    expect(result.value.kind).toBe("cleared");
  });

  it("holds an unparseable range and names it", async () => {
    const current = fixture("^24.0.0", "v24.14.0");
    const narrate: string[] = [];

    const result = await judge(current.root, current.env, current.proof, narrate);

    expect(isErr(result)).toBe(false);
    if (isErr(result)) return;
    expect(result.value.kind).toBe("held");
    expect(narrate).toContain(
      `gate node v24.14.0 at ${join(current.root, "bin", "node")} cannot parse engines ^24.0.0`,
    );
  });

  it("holds when node is missing and names the PATH searched", async () => {
    const current = fixture("24.14.0", "v24.14.0");
    const searched = join(current.root, "missing");
    const env = { ...current.env, PATH: searched };
    const narrate: string[] = [];

    const result = await judge(current.root, env, current.proof, narrate);

    expect(isErr(result)).toBe(false);
    if (isErr(result)) return;
    expect(result.value.kind).toBe("held");
    expect(narrate).toContain(`gate node could not be found on PATH ${searched}`);
  });

  it("refuses worktree setup before its command runs", async () => {
    const current = fixture("24.14.0", "v26.13.0");

    const result = await runWorktreeSetup([current.setup], current.root, () => {}, current.env);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    if (result.error.kind !== "node-engine") return;
    expect(result.error.kind).toBe("node-engine");
    expect(result.error.because).toContain(
      `worktree setup node v26.13.0 at ${join(current.root, "bin", "node")} is outside engines 24.14.0`,
    );
    expect(readFileSync(join(current.root, "package.json"), "utf8")).toContain("24.14.0");
    expect(existsSync(current.setupMarker)).toBe(false);
  });
});

import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { isErr, ok } from "@phyxiusjs/fp";
import { nodeKey } from "ledger";
import { noneClient } from "substrate";
import { afterEach, describe, expect, it } from "vitest";
import { judgeGates } from "../src/gateJudge.ts";
import { readGateOutput } from "../src/gateOutput.ts";
import { runSetupCommand } from "../src/worktreeSetup.ts";
import { memoryLedger } from "./support/memoryLedger.ts";

const runsRoot = join(import.meta.dirname, ".runs", "gate-output-is-plain");
mkdirSync(runsRoot, { recursive: true });

let directories: string[] = [];

afterEach(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
  directories = [];
});

function fixtureDir(): string {
  const directory = mkdtempSync(join(runsRoot, "case-"));
  directories.push(directory);
  return directory;
}

function fixtureScript(directory: string, name: string, source: string): string {
  const path = join(directory, name);
  writeFileSync(path, source);
  return path;
}

function fakeMise(directory: string): string {
  const path = fixtureScript(directory, "mise", '#!/bin/sh\nshift 3\nexec "$@"\n');
  chmodSync(path, 0o755);
  return path;
}

function command(path: string): string {
  return `${process.execPath} ${path}`;
}

function environment(result: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    RESULT: result,
    CI: "0",
    NO_COLOR: "caller-value",
    FORCE_COLOR: "1",
    FORCE_COLORS: "1",
    CLICOLOR_FORCE: "1",
    npm_config_confirm_modules_purge: "true",
  };
}

async function successfulNodeVersion() {
  return ok({ code: 0, signal: null, stdout: "", stderr: "" });
}

describe("plain command environments", () => {
  it("removes caller color forcing from gate commands while preserving non-interactive values", async () => {
    const root = fixtureDir();
    const mise = fakeMise(root);
    const resultPath = join(root, "gate-environment.json");
    const outputDirectory = join(root, "outputs");
    mkdirSync(outputDirectory);
    const probe = fixtureScript(
      root,
      "gate-environment.mjs",
      [
        "import { writeFileSync } from 'node:fs';",
        "writeFileSync(process.env.RESULT, JSON.stringify({",
        "  ci: process.env.CI,",
        "  noColor: process.env.NO_COLOR,",
        "  forceColor: process.env.FORCE_COLOR,",
        "  forceColors: process.env.FORCE_COLORS,",
        "  clicolorForce: process.env.CLICOLOR_FORCE,",
        "  purge: process.env.npm_config_confirm_modules_purge,",
        "}));",
        "process.stdout.write('Tests 1 passed\\n');",
        "",
      ].join("\n"),
    );

    const judged = await judgeGates({
      ledger: memoryLedger(),
      clock: createControlledClock(),
      node: { graph: "fixture", id: "gate-environment" },
      session: "session",
      declaredGateIds: ["tested"],
      commandFor: new Map([
        [
          "tested",
          { kind: "command", run: command(probe), expectOutput: /Tests +[1-9][0-9]* passed/ },
        ],
      ]),
      worktree: root,
      scopeRoot: root,
      scopePaths: [],
      commitSha: "deadbeef",
      runnerId: "runner",
      holdMs: 60_000,
      substrate: noneClient(),
      env: environment(resultPath),
      heavy: [mise],
      nodeVersionRunner: successfulNodeVersion,
      outputDirectory,
      narrate: () => {},
    });

    if (isErr(judged)) throw new Error(`expected gate judgement: ${JSON.stringify(judged.error)}`);
    expect(judged.value.kind).toBe("cleared");
    expect(JSON.parse(readFileSync(resultPath, "utf8"))).toEqual({
      ci: "1",
      noColor: "1",
      forceColor: undefined,
      forceColors: undefined,
      clicolorForce: undefined,
      purge: "false",
    });
  });

  it("removes caller color forcing from setup commands while preserving non-interactive values", async () => {
    const root = fixtureDir();
    const mise = fakeMise(root);
    const resultPath = join(root, "setup-environment.json");
    const probe = fixtureScript(
      root,
      "setup-environment.mjs",
      [
        "import { writeFileSync } from 'node:fs';",
        "writeFileSync(process.env.RESULT, JSON.stringify({",
        "  ci: process.env.CI,",
        "  noColor: process.env.NO_COLOR,",
        "  forceColor: process.env.FORCE_COLOR,",
        "  forceColors: process.env.FORCE_COLORS,",
        "  clicolorForce: process.env.CLICOLOR_FORCE,",
        "  purge: process.env.npm_config_confirm_modules_purge,",
        "}));",
        "",
      ].join("\n"),
    );

    const result = await runSetupCommand(
      command(probe),
      root,
      environment(resultPath),
      [mise],
      successfulNodeVersion,
    );

    if (isErr(result)) throw new Error(result.error.kind);
    expect(JSON.parse(readFileSync(resultPath, "utf8"))).toEqual({
      ci: "1",
      noColor: "1",
      forceColor: undefined,
      forceColors: undefined,
      clicolorForce: undefined,
      purge: "false",
    });
  });
});

describe("expect_output ANSI handling", () => {
  it("matches colored and other escape sequences without changing retained bytes or outputHash", async () => {
    const root = fixtureDir();
    const outputDirectory = join(root, "outputs");
    mkdirSync(outputDirectory);
    const stdout = Buffer.from("\u001b]0;gate\u0007\u001b[32mTests 4 passed (4)\u001b[39m\n");
    const stderr = Buffer.from("\u001b[2mfixture stderr\u001b[22m\n");
    const output = Buffer.concat([stdout, stderr]);
    const ledger = memoryLedger();

    const judged = await judgeGates({
      ledger,
      clock: createControlledClock(),
      node: { graph: "fixture", id: "colored-output" },
      session: "session",
      declaredGateIds: ["tested"],
      commandFor: new Map([
        [
          "tested",
          {
            kind: "command",
            run: "fixture command",
            expectOutput: /Tests +[1-9][0-9]* passed \([1-9][0-9]*\)/,
          },
        ],
      ]),
      worktree: root,
      scopeRoot: root,
      scopePaths: [],
      commitSha: "deadbeef",
      runnerId: "runner",
      holdMs: 60_000,
      substrate: noneClient(),
      commandRunner: async () => ({
        exitCode: 0,
        output: output.toString("utf8"),
        stdout,
        stderr,
      }),
      outputDirectory,
      narrate: () => {},
    });

    if (isErr(judged)) throw new Error("expected gate judgement");
    expect(judged.value.kind).toBe("cleared");
    const receipt = ledger
      .projection()
      .nodes.get(nodeKey({ graph: "fixture", id: "colored-output" }))?.receipts[0];
    expect(receipt?.proof).toMatchObject({
      outputHash: createHash("sha256").update(output).digest("hex"),
      outputMatched: true,
      pattern: "Tests +[1-9][0-9]* passed \\([1-9][0-9]*\\)",
    });
    if (receipt === undefined) return;
    const retained = await readGateOutput(outputDirectory, receipt.proof);
    if (isErr(retained) || retained.value.kind !== "available") {
      throw new Error("expected retained gate output");
    }
    expect(retained.value).toEqual({ kind: "available", stdout, stderr });
  });

  it("keeps plain matching output satisfied and non-matching output held", async () => {
    const cases = [
      { id: "plain", output: "Tests 2 passed (2)\n", expected: "cleared" },
      { id: "wrong", output: "Tests 0 passed (0)\n", expected: "held" },
    ] as const;

    for (const entry of cases) {
      const root = fixtureDir();
      const outputDirectory = join(root, "outputs");
      mkdirSync(outputDirectory);
      const ledger = memoryLedger();
      const judged = await judgeGates({
        ledger,
        clock: createControlledClock(),
        node: { graph: "fixture", id: entry.id },
        session: "session",
        declaredGateIds: ["tested"],
        commandFor: new Map([
          [
            "tested",
            {
              kind: "command",
              run: "fixture command",
              expectOutput: /Tests +[1-9][0-9]* passed \([1-9][0-9]*\)/,
            },
          ],
        ]),
        worktree: root,
        scopeRoot: root,
        scopePaths: [],
        commitSha: "deadbeef",
        runnerId: "runner",
        holdMs: 60_000,
        substrate: noneClient(),
        commandRunner: async () => ({
          exitCode: 0,
          output: entry.output,
          stdout: Buffer.from(entry.output),
          stderr: Buffer.alloc(0),
        }),
        outputDirectory,
        narrate: () => {},
      });

      if (isErr(judged)) throw new Error("expected gate judgement");
      expect(judged.value.kind).toBe(entry.expected);
    }
  });
});

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { fold, type LedgerEvent } from "ledger";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  driveOnce,
  fixtureRepository,
  isolateGitForThisProcess,
  legacyLocalYaml,
  recordingRuntime,
  selectedRuntime,
} from "./support/driveFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;
let restoreGit: (() => void) | undefined;

beforeEach(() => {
  restoreGit = isolateGitForThisProcess();
  directory = realpathSync(mkdtempSync(join(runsRoot, "session-start-")));
});

afterEach(() => {
  restoreGit?.();
  restoreGit = undefined;
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("the runner records when it started a session", () => {
  it("writes its clock's wall time on session-started, and the projection reads it back known", async () => {
    if (directory === undefined) throw new Error("expected a run directory");
    const repoRoot = fixtureRepository(directory, legacyLocalYaml(["kind: fake", "args: []"]));
    const cataloguePath = join(directory, "runtimes.yaml");
    writeFileSync(
      cataloguePath,
      [
        "interlock: runtimes@v0",
        "runtimes:",
        "  plain:",
        "    kind: fake",
        "    model: m",
        "",
      ].join("\n"),
    );
    const { localConfig, agentRuntime } = await selectedRuntime(repoRoot, cataloguePath, "plain");
    const clock = createControlledClock({ initialTime: 1_762_300_000_000 });

    const { events } = await driveOnce(
      repoRoot,
      "n",
      localConfig,
      agentRuntime,
      recordingRuntime().runtime,
      clock,
    );

    const started = events.find(
      (event): event is Extract<LedgerEvent, { kind: "session-started" }> =>
        event.kind === "session-started",
    );
    expect(started?.startedAt).toBe(1_762_300_000_000);
    const [session] = fold(events).sessions.values();
    expect(session?.startedAt).toEqual({ state: "known", epochMs: 1_762_300_000_000 });
  });
});

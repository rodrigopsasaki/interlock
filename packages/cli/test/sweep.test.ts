import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { afterEach, describe, expect, it } from "vitest";
import { runInterlockSweep } from "../src/sweep.ts";
import { gitInitFixture } from "./graph/gitFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function fixture(): string {
  directory = mkdtempSync(join(runsRoot, "sweep-"));
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  gitInitFixture(directory);
  return directory;
}

function journalLines(cwd: string): readonly unknown[] {
  const raw = readFileSync(join(cwd, ".interlock", "ledger", "journal.jsonl"), "utf-8");
  return raw
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line): unknown => JSON.parse(line));
}

describe("interlock sweep", () => {
  it("reports nothing to abandon on an empty journal", async () => {
    const cwd = fixture();
    const result = await runInterlockSweep([], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("no expired");
  });

  it("abandons a session whose lease is already expired at sweep time", async () => {
    const cwd = fixture();
    mkdirSync(join(cwd, ".interlock", "ledger"), { recursive: true });
    const node = { graph: "demo", id: "a" };
    const events = [
      { interlock: "event@v2", kind: "node-created", node },
      {
        interlock: "event@v2",
        kind: "session-started",
        session: { id: "session-1", node },
        brief: {
          graph: "demo",
          node: "a",
          role: "worker",
          acceptance: "",
          gates: [],
          scope: [],
        },
      },
      {
        interlock: "event@v2",
        kind: "lease-taken",
        node,
        session: "session-1",
        expiry: 1_000,
      },
    ];
    writeFileSync(
      join(cwd, ".interlock", "ledger", "journal.jsonl"),
      `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
    );

    const clock = createControlledClock({ initialTime: 5_000 });
    const result = await runInterlockSweep([], { cwd, clock });
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("abandoned 1 session(s): session-1");

    const kinds = journalLines(cwd).map((event) =>
      typeof event === "object" && event !== null && "kind" in event ? String(event.kind) : "",
    );
    expect(kinds).toContain("lease-expired");
    expect(kinds).toContain("outcome-set");
  });
});

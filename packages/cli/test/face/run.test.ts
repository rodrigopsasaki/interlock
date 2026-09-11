import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { gitInitFixture } from "../graph/gitFixture.ts";
import { runInterlockFace } from "../../src/face/run.ts";
import type { FaceKey } from "face";
import type { DispatchResult } from "../../src/face/dispatch.ts";

const runsRoot = join(import.meta.dirname, "..", ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined)
    rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function fixture(): string {
  directory = mkdtempSync(join(runsRoot, "run-"));
  gitInitFixture(directory);
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  writeFileSync(
    join(directory, ".interlock", "graphs", "demo.yaml"),
    [
      "interlock: graph@v0",
      "id: demo",
      "nodes:",
      "  - id: a",
      "    depends_on: []",
      "",
    ].join("\n"),
  );
  return directory;
}

async function* keysOf(keys: readonly FaceKey[]): AsyncIterable<FaceKey> {
  for (const key of keys) yield key;
}

function fakeStdout(): {
  write(text: string): boolean;
  writes: readonly string[];
} {
  const writes: string[] = [];
  return {
    write(text: string) {
      writes.push(text);
      return true;
    },
    writes,
  };
}

describe("runInterlockFace", () => {
  it("drills from Plans into Graph on Enter, dispatches a node-scoped verb as a subprocess, and quits on q", async () => {
    const cwd = fixture();
    const calls: (readonly string[])[] = [];
    const dispatch = (args: readonly string[]): Promise<DispatchResult> => {
      calls.push(args);
      return Promise.resolve({
        exitCode: 0,
        lastLine: "interlock run: cleared",
      });
    };
    const stdout = fakeStdout();

    const result = await runInterlockFace([], {
      cwd,
      by: "rodrigo",
      dispatch,
      stdout: stdout as unknown as NodeJS.WriteStream,
      keys: keysOf([
        { name: "enter" },
        { name: "char", char: "R" },
        { name: "char", char: "q" },
      ]),
    });

    expect(result.exitCode).toBe(0);
    expect(calls).toEqual([["run", "demo", "a"]]);
    expect(
      stdout.writes.some((chunk) => chunk.includes("interlock run: cleared")),
    ).toBe(true);
  });

  it("starting with a graph argument opens directly at Graph level for that graph", async () => {
    const cwd = fixture();
    const stdout = fakeStdout();

    await runInterlockFace(["demo"], {
      cwd,
      stdout: stdout as unknown as NodeJS.WriteStream,
      keys: keysOf([{ name: "char", char: "q" }]),
    });

    expect(stdout.writes.some((chunk) => chunk.includes("graph demo"))).toBe(
      true,
    );
  });

  it("prompts for because on an accountable verb and dispatches once it is submitted", async () => {
    const cwd = fixture();
    const calls: (readonly string[])[] = [];
    const dispatch = (args: readonly string[]): Promise<DispatchResult> => {
      calls.push(args);
      return Promise.resolve({ exitCode: 0, lastLine: "waived" });
    };
    const stdout = fakeStdout();

    await runInterlockFace(["demo"], {
      cwd,
      by: "rodrigo",
      dispatch,
      stdout: stdout as unknown as NodeJS.WriteStream,
      keys: keysOf([
        { name: "char", char: "c" },
        { name: "char", char: "n" },
        { name: "char", char: "o" },
        { name: "enter" },
        { name: "char", char: "q" },
      ]),
    });

    expect(calls).toEqual([
      ["node", "cancel", "demo", "a", "--by", "rodrigo", "--because", "no"],
    ]);
  });
});

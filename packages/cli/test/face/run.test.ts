import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { FaceKey } from "face";
import { afterEach, describe, expect, it } from "vitest";
import type { DispatchResult } from "../../src/face/dispatch.ts";
import { runInterlockFace } from "../../src/face/run.ts";
import { gitInitFixture } from "../graph/gitFixture.ts";

const runsRoot = join(import.meta.dirname, "..", ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function fixture(): string {
  directory = mkdtempSync(join(runsRoot, "run-"));
  gitInitFixture(directory);
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  writeFileSync(
    join(directory, ".interlock", "graphs", "demo.yaml"),
    ["interlock: graph@v0", "id: demo", "nodes:", "  - id: a", "    depends_on: []", ""].join("\n"),
  );
  return directory;
}

function fixtureManyIndependentNodes(count: number): string {
  directory = mkdtempSync(join(runsRoot, "run-"));
  gitInitFixture(directory);
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  const ids = Array.from({ length: count }, (_, index) => `n${index}`);
  writeFileSync(
    join(directory, ".interlock", "graphs", "many.yaml"),
    [
      "interlock: graph@v0",
      "id: many",
      "nodes:",
      ...ids.map((id) => `  - id: ${id}\n    depends_on: []`),
      "",
    ].join("\n"),
  );
  return directory;
}

function nodeIdsOf(lines: readonly string[]): readonly string[] {
  return lines
    .map((line) => /^[>\s]{2}(?:● | {2})?([^\s]+) — /.exec(line)?.[1])
    .filter((id): id is string => id !== undefined);
}

function cursorRowIndex(frame: string): number {
  const lines = frame.split("\n");
  const cursorAt = lines.findIndex((line) => /^> /.test(line));
  if (cursorAt < 0) throw new Error("no cursor row in this frame");
  return nodeIdsOf(lines.slice(0, cursorAt + 1)).length - 1;
}

async function* keysOf(keys: readonly FaceKey[]): AsyncIterable<FaceKey> {
  for (const key of keys) yield key;
}

function fakeStdout(): {
  write(text: string): boolean;
  on(event: string, listener: () => void): void;
  off(event: string, listener: () => void): void;
  writes: readonly string[];
} {
  const writes: string[] = [];
  return {
    write(text: string) {
      writes.push(text);
      return true;
    },
    on() {},
    off() {},
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
      keys: keysOf([{ name: "enter" }, { name: "char", char: "R" }, { name: "char", char: "q" }]),
    });

    expect(result.exitCode).toBe(0);
    expect(calls).toEqual([["run", "demo", "a"]]);
    expect(stdout.writes.some((chunk) => chunk.includes("interlock run: cleared"))).toBe(true);
  });

  it("starting with a graph argument opens directly at Graph level for that graph", async () => {
    const cwd = fixture();
    const stdout = fakeStdout();

    await runInterlockFace(["demo"], {
      cwd,
      stdout: stdout as unknown as NodeJS.WriteStream,
      keys: keysOf([{ name: "char", char: "q" }]),
    });

    expect(stdout.writes.some((chunk) => chunk.includes("graph demo"))).toBe(true);
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

    expect(calls).toEqual([["node", "cancel", "demo", "a", "--by", "rodrigo", "--because", "no"]]);
  });

  it("a burst of six j keys, yielded without awaiting between them, moves the cursor six rows", async () => {
    const cwd = fixtureManyIndependentNodes(8);
    const stdout = fakeStdout();

    await runInterlockFace(["many"], {
      cwd,
      stdout: stdout as unknown as NodeJS.WriteStream,
      keys: keysOf([
        { name: "char", char: "j" },
        { name: "char", char: "j" },
        { name: "char", char: "j" },
        { name: "char", char: "j" },
        { name: "char", char: "j" },
        { name: "char", char: "j" },
        { name: "char", char: "q" },
      ]),
    });

    const CLEAR_AND_HOME = "\x1b[2J\x1b[H";
    const lastFrame = stdout.writes.filter((chunk) => chunk.startsWith(CLEAR_AND_HOME)).at(-1);
    if (lastFrame === undefined) throw new Error("expected a drawn frame");
    expect(cursorRowIndex(lastFrame.slice(CLEAR_AND_HOME.length))).toBe(6);
  });

  it("decoded keys from real stdin queue rather than vanish, even pushed as separate reads before anything consumes them", async () => {
    const cwd = fixtureManyIndependentNodes(8);
    const stdout = fakeStdout();
    const stdin = new Readable({ read() {} });
    Object.assign(stdin, { isTTY: false });

    for (const char of "jjjjjj") stdin.push(char);
    stdin.push("q");
    stdin.push(null);

    await runInterlockFace(["many"], {
      cwd,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
    });

    const CLEAR_AND_HOME = "\x1b[2J\x1b[H";
    const lastFrame = stdout.writes.filter((chunk) => chunk.startsWith(CLEAR_AND_HOME)).at(-1);
    if (lastFrame === undefined) throw new Error("expected a drawn frame");
    expect(cursorRowIndex(lastFrame.slice(CLEAR_AND_HOME.length))).toBe(6);
  });
});

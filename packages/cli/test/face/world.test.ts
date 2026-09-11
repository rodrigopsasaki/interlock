import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isErr } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import { gitInitFixture } from "../graph/gitFixture.ts";
import {
  buildGraphWorld,
  buildPlansWorld,
  buildSessionText,
} from "../../src/face/world.ts";

const runsRoot = join(import.meta.dirname, "..", ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined)
    rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function writeGraph(name: string, id: string, extraNodes = ""): void {
  directory = directory ?? mkdtempSync(join(runsRoot, "run-"));
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  writeFileSync(
    join(directory, ".interlock", "graphs", `${name}.yaml`),
    [
      "interlock: graph@v0",
      `id: ${id}`,
      "nodes:",
      "  - id: a",
      "    depends_on: []",
      extraNodes,
      "",
    ].join("\n"),
  );
}

function fixture(): string {
  directory = mkdtempSync(join(runsRoot, "run-"));
  gitInitFixture(directory);
  return directory;
}

describe("buildPlansWorld", () => {
  it("lists a plan entry per graph file, sorted, over an empty journal", async () => {
    const cwd = fixture();
    writeGraph("bravo", "bravo");
    writeGraph("alpha", "alpha");

    const world = await buildPlansWorld(cwd, undefined);
    expect(world.plans.map((entry) => entry.graph)).toEqual(["alpha", "bravo"]);
    expect(world.plans[0]).toMatchObject({
      approval: "not-approved",
      cleared: 0,
      total: 1,
      liveSessions: 0,
    });
    expect(world.position).toBeUndefined();
  });

  it("skips a malformed graph file rather than refusing the whole plans world", async () => {
    const cwd = fixture();
    writeGraph("good", "good");
    directory = cwd;
    writeFileSync(
      join(cwd, ".interlock", "graphs", "bad.yaml"),
      "interlock: graph@v1\nid: bad\nnodes: []\n",
    );

    const world = await buildPlansWorld(cwd, undefined);
    expect(world.plans.map((entry) => entry.graph)).toEqual(["good"]);
  });
});

describe("buildGraphWorld", () => {
  it("loads the named graph's position over an empty journal", async () => {
    const cwd = fixture();
    writeGraph("demo", "demo");

    const built = await buildGraphWorld(cwd, "demo", undefined);
    if (isErr(built)) throw new Error("expected a world");
    expect(built.value.position?.graph).toBe("demo");
    expect(built.value.position?.nodes[0]).toMatchObject({
      id: "a",
      state: { kind: "ready" },
    });
    expect(built.value.plans).toEqual([]);
  });

  it("refuses with the graph's own refusal when the file is missing", async () => {
    const cwd = fixture();
    const built = await buildGraphWorld(cwd, "missing", undefined);
    expect(isErr(built)).toBe(true);
  });
});

describe("buildSessionText", () => {
  it("names the node and session when nothing was ever recorded for it", async () => {
    const cwd = fixture();
    const text = await buildSessionText(cwd, "demo", "a", "no-such-session");
    expect(text).toBe(
      'demo/a: no session "no-such-session" recorded for this node.',
    );
  });
});

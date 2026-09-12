import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isOk } from "@phyxiusjs/fp";
import type { BriefFrontMatter, BriefGate } from "debrief";
import { readBriefFile } from "debrief";
import type { GateDeclaration } from "face";
import { afterEach, describe, expect, it } from "vitest";
import {
  authoritativeBriefGates,
  diffGates,
  diffScope,
  renderBriefFile,
} from "../src/briefRewrite.ts";
import type { StandingGate } from "../src/standingGates.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

const standing: readonly StandingGate[] = [
  { id: "typecheck", kind: "command", run: "pnpm typecheck" },
];
const nodeGates: readonly GateDeclaration[] = [
  { id: "own-gate", kind: "command", run: "pnpm test" },
  { id: "human-gate", kind: "human" },
];

describe("authoritativeBriefGates", () => {
  it("lists the standing table first, then the node's own", () => {
    expect(authoritativeBriefGates(standing, nodeGates)).toEqual([
      { id: "typecheck", kind: "command", run: "pnpm typecheck" },
      { id: "own-gate", kind: "command", run: "pnpm test" },
      { id: "human-gate", kind: "human" },
    ]);
  });

  it("carries a declared expect_output through as its source string", () => {
    const standingWithPattern: readonly StandingGate[] = [
      {
        id: "test",
        kind: "command",
        run: "pnpm test",
        expectOutput: /Tests +[1-9][0-9]* passed/,
      },
    ];
    const nodeGatesWithPattern: readonly GateDeclaration[] = [
      {
        id: "own-gate",
        kind: "command",
        run: "pnpm review",
        expectOutput: /reviewed/,
      },
    ];

    expect(authoritativeBriefGates(standingWithPattern, nodeGatesWithPattern)).toEqual([
      {
        id: "test",
        kind: "command",
        run: "pnpm test",
        expectOutput: "Tests +[1-9][0-9]* passed",
      },
      {
        id: "own-gate",
        kind: "command",
        run: "pnpm review",
        expectOutput: "reviewed",
      },
    ]);
  });
});

describe("diffGates", () => {
  const authoritative = authoritativeBriefGates(standing, nodeGates);

  it("narrates nothing when the two lists agree", () => {
    expect(diffGates(authoritative, authoritative)).toEqual([]);
  });

  it("narrates a gate the runner added", () => {
    const previous = authoritative.slice(0, 1);
    const lines = diffGates(previous, authoritative);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("own-gate");
    expect(lines[0]).toContain("human-gate");
  });

  it("narrates a gate the repository copy declared that the runner's view does not", () => {
    const stale: readonly BriefGate[] = [
      ...authoritative,
      { id: "stale-gate", kind: "command", run: "pnpm stale" },
    ];
    const lines = diffGates(stale, authoritative);
    expect(lines.join(" ")).toContain("stale-gate");
  });

  it("narrates when the same id changed its command", () => {
    const changed: readonly BriefGate[] = [
      { id: "typecheck", kind: "command", run: "pnpm build" },
      authoritative[1],
      authoritative[2],
    ].filter((gate): gate is BriefGate => gate !== undefined);
    expect(diffGates(changed, authoritative)).not.toEqual([]);
  });
});

describe("diffScope", () => {
  it("narrates nothing when the two lists carry the same paths, any order", () => {
    expect(diffScope(["b.ts", "a.ts"], ["a.ts", "b.ts"])).toEqual([]);
  });

  it("narrates a count-based summary when the paths differ, without listing every path", () => {
    const lines = diffScope(["a.ts"], ["a.ts", "b.ts", "c.ts"]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("1");
    expect(lines[0]).toContain("3");
  });
});

describe("renderBriefFile", () => {
  function write(content: string): string {
    directory = mkdtempSync(join(runsRoot, "render-"));
    const path = join(directory, "brief.md");
    writeFileSync(path, content);
    return path;
  }

  it("round-trips through readBriefFile with the runner fields filled in", async () => {
    const frontMatter: BriefFrontMatter = {
      graph: "g",
      node: "n",
      role: "worker",
      gates: authoritativeBriefGates(standing, nodeGates),
      scope: ["a.ts", "b.ts"],
      substrate: { address: "none" },
      runner: {
        kind: "worktree",
        graphBaseSha: "a".repeat(40),
        session: "session-1",
      },
    };

    const content = renderBriefFile(frontMatter, "\n# brief\n");
    const path = write(content);
    const read = await readBriefFile(path);
    expect(isOk(read)).toBe(true);
    if (!isOk(read) || read.value.kind !== "v1") throw new Error("expected v1");
    expect(read.value.frontMatter).toEqual(frontMatter);
    expect(read.value.body).toBe("\n# brief\n");
  });

  it("round-trips a gate's expect_output through the rendered front matter", async () => {
    const standingWithPattern: readonly StandingGate[] = [
      {
        id: "test",
        kind: "command",
        run: "pnpm test",
        expectOutput: /Tests +[1-9][0-9]* passed/,
      },
    ];
    const frontMatter: BriefFrontMatter = {
      graph: "g",
      node: "n",
      role: "worker",
      gates: authoritativeBriefGates(standingWithPattern, []),
      scope: [],
      substrate: { address: "none" },
      runner: {
        kind: "worktree",
        graphBaseSha: "a".repeat(40),
        session: "session-1",
      },
    };

    const content = renderBriefFile(frontMatter, "\n# brief\n");
    const path = write(content);
    const read = await readBriefFile(path);
    expect(isOk(read)).toBe(true);
    if (!isOk(read) || read.value.kind !== "v1") throw new Error("expected v1");
    expect(read.value.frontMatter.gates).toEqual([
      {
        id: "test",
        kind: "command",
        run: "pnpm test",
        expectOutput: "Tests +[1-9][0-9]* passed",
      },
    ]);
  });

  it("omits graph_base_sha and session for a repository-state front matter", async () => {
    const frontMatter: BriefFrontMatter = {
      graph: "g",
      node: "n",
      role: "worker",
      gates: [],
      scope: [],
      substrate: { address: "none" },
      runner: { kind: "repository" },
    };

    const content = renderBriefFile(frontMatter, "body\n");
    expect(content).not.toContain("graph_base_sha");
    expect(content).not.toContain("session:");
    const path = write(content);
    const read = await readBriefFile(path);
    if (!isOk(read) || read.value.kind !== "v1") throw new Error("expected v1");
    expect(read.value.frontMatter.runner).toEqual({ kind: "repository" });
  });
});

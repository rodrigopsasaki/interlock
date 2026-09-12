import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isErr, isOk } from "@phyxiusjs/fp";
import { readBriefFile } from "debrief";
import type { GateDeclaration } from "face";
import { noneClient, type SubstrateClient } from "substrate";
import { afterEach, describe, expect, it } from "vitest";
import {
  briefPath,
  explainSessionBriefRefusal,
  writeBriefIntoWorktree,
} from "../src/sessionBrief.ts";
import type { StandingGate } from "../src/standingGates.ts";
import { gitInitFixtureWithContent } from "./support/gitFixture.ts";

const substrate = noneClient();

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let repoRoot: string | undefined;
let worktreePath: string | undefined;

afterEach(() => {
  if (repoRoot !== undefined) rmSync(repoRoot, { recursive: true, force: true });
  if (worktreePath !== undefined) rmSync(worktreePath, { recursive: true, force: true });
  repoRoot = undefined;
  worktreePath = undefined;
});

function fixture(briefContent: string): {
  readonly repo: string;
  readonly worktree: string;
} {
  repoRoot = mkdtempSync(join(runsRoot, "session-brief-"));
  worktreePath = mkdtempSync(join(runsRoot, "session-brief-wt-"));
  const dir = join(repoRoot, ".interlock", "sessions", "g", "n");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "brief.md"), briefContent);
  writeFileSync(join(repoRoot, "tracked.ts"), "export const x = 1;\n");
  gitInitFixtureWithContent(repoRoot);
  return { repo: repoRoot, worktree: worktreePath };
}

const standing: readonly StandingGate[] = [
  { id: "typecheck", kind: "command", run: "pnpm typecheck" },
];
const nodeGates: readonly GateDeclaration[] = [
  { id: "own-gate", kind: "command", run: "pnpm test" },
];

const v1WithMatchingGatesAndScope = [
  "---",
  "interlock: brief@v1",
  "graph: g",
  "node: n",
  "role: worker",
  "gates:",
  "  - id: typecheck",
  "    kind: command",
  "    run: pnpm typecheck",
  "  - id: own-gate",
  "    kind: command",
  "    run: pnpm test",
  "scope:",
  "  - .interlock/sessions/g/n/brief.md",
  "  - tracked.ts",
  "substrate:",
  "  address: none",
  "---",
  "",
  "# brief",
  "",
].join("\n");

describe("writeBriefIntoWorktree", () => {
  it("refuses a legacy brief@v0 with the exact sentence, writing nothing", async () => {
    const { repo, worktree } = fixture("# Brief · node `n` · graph `g`\n");
    const result = await writeBriefIntoWorktree(
      repo,
      worktree,
      "g",
      "n",
      "a".repeat(40),
      "session-1",
      standing,
      nodeGates,
      substrate,
    );
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(explainSessionBriefRefusal(result.error)).toBe(
      "brief for g/n is brief@v0; the runner requires brief@v1; add front matter",
    );
  });

  it("fills graph_base_sha and session, and narrates only the context call when gates and scope already agree", async () => {
    const { repo, worktree } = fixture(v1WithMatchingGatesAndScope);
    const sha = "b".repeat(40);
    const result = await writeBriefIntoWorktree(
      repo,
      worktree,
      "g",
      "n",
      sha,
      "session-1",
      standing,
      nodeGates,
      substrate,
    );
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.narration).toEqual(["context none: no substrate addressed"]);

    const written = await readBriefFile(briefPath(worktree, "g", "n"));
    expect(isOk(written)).toBe(true);
    if (!isOk(written) || written.value.kind !== "v1") throw new Error("expected v1");
    expect(written.value.frontMatter.runner).toEqual({
      kind: "worktree",
      graphBaseSha: sha,
      session: "session-1",
    });
  });

  it("rewrites and narrates when the repository copy's gates are stale", async () => {
    const stale = v1WithMatchingGatesAndScope.replace(
      "  - id: own-gate\n    kind: command\n    run: pnpm test\n",
      "",
    );
    const { repo, worktree } = fixture(stale);
    const result = await writeBriefIntoWorktree(
      repo,
      worktree,
      "g",
      "n",
      "c".repeat(40),
      "session-1",
      standing,
      nodeGates,
      substrate,
    );
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.narration.some((line) => line.includes("own-gate"))).toBe(true);

    const written = await readBriefFile(briefPath(worktree, "g", "n"));
    if (!isOk(written) || written.value.kind !== "v1") throw new Error("expected v1");
    expect(written.value.frontMatter.gates.map((gate) => gate.id)).toEqual([
      "typecheck",
      "own-gate",
    ]);
  });

  it("preserves the body verbatim", async () => {
    const { repo, worktree } = fixture(v1WithMatchingGatesAndScope);
    await writeBriefIntoWorktree(
      repo,
      worktree,
      "g",
      "n",
      "d".repeat(40),
      "session-1",
      standing,
      nodeGates,
      substrate,
    );
    const content = readFileSync(briefPath(worktree, "g", "n"), "utf-8");
    expect(content).toContain("# brief");
  });
});

const v1WithContextSliceSection = [
  "---",
  "interlock: brief@v1",
  "graph: g",
  "node: n",
  "role: worker",
  "gates:",
  "  - id: typecheck",
  "    kind: command",
  "    run: pnpm typecheck",
  "  - id: own-gate",
  "    kind: command",
  "    run: pnpm test",
  "scope:",
  "  - .interlock/sessions/g/n/brief.md",
  "  - tracked.ts",
  "substrate:",
  "  address: none",
  "---",
  "",
  "## Context slice",
  "",
  "No substrate is addressed. This section is empty.",
  "",
  "## Constraints",
  "",
  "Read-only fixture.",
  "",
].join("\n");

function fakeSubstrateAt(address: string): SubstrateClient {
  return {
    address,
    context: () =>
      Promise.resolve({
        kind: "rendered",
        items: [
          {
            kind: "convention" as const,
            statement: "commits state the why in the subject",
            derivation: "human:Rodrigo Sasaki",
          },
        ],
        vocabulary: "reference@v1",
      }),
    absorb: () => Promise.resolve({ kind: "empty" }),
    capabilities: () => Promise.resolve([]),
  };
}

describe("writeBriefIntoWorktree with a substrate that renders a slice", () => {
  it("replaces the 'no substrate' section with the rendered slice and narrates the call", async () => {
    const { repo, worktree } = fixture(v1WithContextSliceSection);
    const result = await writeBriefIntoWorktree(
      repo,
      worktree,
      "g",
      "n",
      "e".repeat(40),
      "session-1",
      standing,
      nodeGates,
      fakeSubstrateAt("http://fake-substrate.example"),
    );
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.narration).toEqual([
      "context http://fake-substrate.example: 1 item(s), vocabulary reference@v1",
    ]);

    const content = readFileSync(briefPath(worktree, "g", "n"), "utf-8");
    expect(content).not.toContain("No substrate is addressed");
    expect(content).toContain("### Convention");
    expect(content).toContain("commits state the why in the subject");
    expect(content).toContain("## Constraints");
    // The committed front matter's own substrate.address is never rewritten by the runner.
    expect(content).toContain("address: none");
  });
});

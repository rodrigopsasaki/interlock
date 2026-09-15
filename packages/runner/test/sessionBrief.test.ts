import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isErr, isOk } from "@phyxiusjs/fp";
import { type Item, readBriefFile } from "debrief";
import type { GateDeclaration } from "face";
import { noneClient, type SubstrateClient } from "substrate";
import { afterEach, describe, expect, it } from "vitest";
import { contextSliceOf, withRenderedContextSlice } from "../src/contextSlice.ts";
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
    expect(result.value.openingView).toContain("Prompt projection, not a brief file.");
    expect(result.value.openingView).toContain("It deliberately omits scope entries");
    expect(result.value.openingView).toContain("must not replace the canonical file");
    expect(result.value.openingView).toContain("scope_count: 2");
    expect(result.value.openingView).toContain(
      `scope_sha256: ${createHash("sha256")
        .update(JSON.stringify([".interlock/sessions/g/n/brief.md", "tracked.ts"]), "utf8")
        .digest("hex")}`,
    );
    expect(result.value.openingView).toContain("scope_serialization: UTF-8 JSON.stringify(scope)");
    expect(result.value.openingView).toContain("canonical_path: .interlock/sessions/g/n/brief.md");
    expect(result.value.openingView).not.toContain("  - tracked.ts");
  });

  it("uses a valid context_scope for context while preserving the full canonical scope", async () => {
    const selected = v1WithMatchingGatesAndScope.replace(
      "substrate:\n  address: none",
      "context_scope:\n  - tracked.ts\nsubstrate:\n  address: none",
    );
    const { repo, worktree } = fixture(selected);
    let requestedScope: readonly string[] | undefined;
    const capturedSubstrate: SubstrateClient = {
      address: "http://captured.example",
      context: (_node, scope) => {
        requestedScope = scope;
        return Promise.resolve({ kind: "empty" });
      },
      absorb: () => Promise.resolve({ kind: "empty" }),
      capabilities: () => Promise.resolve([]),
    };
    const result = await writeBriefIntoWorktree(
      repo,
      worktree,
      "g",
      "n",
      "b".repeat(40),
      "session-1",
      standing,
      nodeGates,
      capturedSubstrate,
    );
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(requestedScope).toEqual(["tracked.ts"]);
    const written = await readBriefFile(briefPath(worktree, "g", "n"));
    if (!isOk(written) || written.value.kind !== "v1") throw new Error("expected v1");
    expect(written.value.frontMatter.scope).toEqual([
      ".interlock/sessions/g/n/brief.md",
      "tracked.ts",
    ]);
    expect(written.value.frontMatter.contextScope).toEqual(["tracked.ts"]);
    expect(result.value.openingView).toContain("context_scope:");
    expect(result.value.openingView).toContain("  - tracked.ts");
  });

  it("refuses an untracked context_scope before calling the substrate", async () => {
    const selected = v1WithMatchingGatesAndScope.replace(
      "substrate:\n  address: none",
      "context_scope:\n  - missing.ts\nsubstrate:\n  address: none",
    );
    const { repo, worktree } = fixture(selected);
    let calls = 0;
    const countedSubstrate: SubstrateClient = {
      address: "http://captured.example",
      context: () => {
        calls += 1;
        return Promise.resolve({ kind: "empty" });
      },
      absorb: () => Promise.resolve({ kind: "empty" }),
      capabilities: () => Promise.resolve([]),
    };
    const result = await writeBriefIntoWorktree(
      repo,
      worktree,
      "g",
      "n",
      "b".repeat(40),
      "session-1",
      standing,
      nodeGates,
      countedSubstrate,
    );
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(explainSessionBriefRefusal(result.error)).toContain('context_scope path "missing.ts"');
    expect(calls).toBe(0);
  });

  it("refuses a reader-safe context_scope alias that is not an exact tracked path", async () => {
    const selected = v1WithMatchingGatesAndScope.replace(
      "substrate:\n  address: none",
      "context_scope:\n  - tracked/../tracked.ts\nsubstrate:\n  address: none",
    );
    const { repo, worktree } = fixture(selected);
    let calls = 0;
    const countedSubstrate: SubstrateClient = {
      address: "http://captured.example",
      context: () => {
        calls += 1;
        return Promise.resolve({ kind: "empty" });
      },
      absorb: () => Promise.resolve({ kind: "empty" }),
      capabilities: () => Promise.resolve([]),
    };
    const result = await writeBriefIntoWorktree(
      repo,
      worktree,
      "g",
      "n",
      "b".repeat(40),
      "session-1",
      standing,
      nodeGates,
      countedSubstrate,
    );
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(explainSessionBriefRefusal(result.error)).toContain("not an exact tracked path");
    expect(calls).toBe(0);
  });

  it("uses the full tracked scope for an addressed legacy query without context_scope", async () => {
    const { repo, worktree } = fixture(v1WithMatchingGatesAndScope);
    let requestedScope: readonly string[] | undefined;
    const capturedSubstrate: SubstrateClient = {
      address: "http://captured.example",
      context: (_node, scope) => {
        requestedScope = scope;
        return Promise.resolve({ kind: "empty" });
      },
      absorb: () => Promise.resolve({ kind: "empty" }),
      capabilities: () => Promise.resolve([]),
    };
    const result = await writeBriefIntoWorktree(
      repo,
      worktree,
      "g",
      "n",
      "b".repeat(40),
      "session-1",
      standing,
      nodeGates,
      capturedSubstrate,
    );
    expect(isOk(result)).toBe(true);
    expect(requestedScope).toEqual([".interlock/sessions/g/n/brief.md", "tracked.ts"]);
  });

  it("accepts a valid context_scope without an addressed substrate", async () => {
    const selected = v1WithMatchingGatesAndScope.replace(
      "substrate:\n  address: none",
      "context_scope:\n  - tracked.ts\nsubstrate:\n  address: none",
    );
    const { repo, worktree } = fixture(selected);
    const result = await writeBriefIntoWorktree(
      repo,
      worktree,
      "g",
      "n",
      "b".repeat(40),
      "session-1",
      standing,
      nodeGates,
      substrate,
    );
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.narration).toEqual(["context none: no substrate addressed"]);
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
    const body = "\n# brief\n\nA blank line above remains.\n\n";
    const { repo, worktree } = fixture(
      v1WithMatchingGatesAndScope.replace("# brief\n", body.slice(1)),
    );
    const result = await writeBriefIntoWorktree(
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
    const bodyStart = content.indexOf("\n---\n") + "\n---\n".length;
    expect(bodyStart).toBeGreaterThan("\n---\n".length - 1);
    expect(content.slice(bodyStart)).toBe(body);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.openingView?.endsWith(body)).toBe(true);
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
  "context_scope:",
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

const addressedItem: Item = {
  kind: "convention",
  statement: "commits state the why in the subject",
  standing: "professed",
  derivation: "human:Rodrigo Sasaki",
};

function fakeSubstrateAt(
  address: string,
  items: readonly Item[] = [addressedItem],
): SubstrateClient {
  return {
    address,
    context: () =>
      Promise.resolve({
        kind: "rendered",
        items,
        vocabulary: "reference@v1",
      }),
    absorb: () => Promise.resolve({ kind: "empty" }),
    capabilities: () => Promise.resolve([]),
  };
}

describe("writeBriefIntoWorktree with a substrate that renders a slice", () => {
  it("appends an unheaded rendered slice to the canonical brief and opening projection", async () => {
    const unheaded = v1WithMatchingGatesAndScope.replace(
      "# brief\n",
      "# brief\n\n## Constraints\n\nRetain this authored content.\n",
    );
    const hypothesis: Item = {
      kind: "decision",
      statement: "A retrieved item is not semantic truth",
      standing: "hypothesis",
      derivation: "agent:test-runtime:test-model",
    };
    const { repo, worktree } = fixture(unheaded);
    const result = await writeBriefIntoWorktree(
      repo,
      worktree,
      "g",
      "n",
      "e".repeat(40),
      "session-1",
      standing,
      nodeGates,
      fakeSubstrateAt("http://fake-substrate.example", [addressedItem, hypothesis]),
    );
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    const written = await readBriefFile(briefPath(worktree, "g", "n"));
    if (!isOk(written) || written.value.kind !== "v1") throw new Error("expected v1");
    const body = written.value.body;
    const slice = contextSliceOf(body);
    expect(body).toContain("## Constraints\n\nRetain this authored content.");
    expect(body.match(/^## Context slice$/gm)).toHaveLength(1);
    expect(slice).toContain("[professed] commits state the why in the subject");
    expect(slice).toContain("derivation: human:Rodrigo Sasaki");
    expect(slice).toContain("[hypothesis] A retrieved item is not semantic truth");
    expect(slice).toContain("derivation: agent:test-runtime:test-model");
    expect(result.value.openingView?.endsWith(body)).toBe(true);
  });

  it("appends the canonical section for an empty body and an empty rendered slice", async () => {
    const { repo, worktree } = fixture(v1WithMatchingGatesAndScope.replace("# brief\n", ""));
    const result = await writeBriefIntoWorktree(
      repo,
      worktree,
      "g",
      "n",
      "f".repeat(40),
      "session-1",
      standing,
      nodeGates,
      fakeSubstrateAt("http://fake-substrate.example", []),
    );
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    const written = await readBriefFile(briefPath(worktree, "g", "n"));
    if (!isOk(written) || written.value.kind !== "v1") throw new Error("expected v1");
    expect(written.value.body).toContain("## Context slice");
    expect(contextSliceOf(written.value.body).trim()).toBe("");
    expect(result.value.openingView?.endsWith(written.value.body)).toBe(true);
  });

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
    // A rendered slice means a real address answered; the committed front matter says so too,
    // so the brief never tells a person it carried no substrate while its own body disagrees.
    expect(content).not.toContain("address: none");
    expect(content).toContain("address: http://fake-substrate.example");
    const bodyStart = content.indexOf("\n---\n") + "\n---\n".length;
    expect(bodyStart).toBeGreaterThan("\n---\n".length - 1);
    expect(result.value.openingView?.endsWith(content.slice(bodyStart))).toBe(true);
  });

  it("leaves the committed front matter's address untouched when no slice was rendered", async () => {
    const { repo, worktree } = fixture(v1WithContextSliceSection);
    await writeBriefIntoWorktree(
      repo,
      worktree,
      "g",
      "n",
      "f".repeat(40),
      "session-1",
      standing,
      nodeGates,
      substrate,
    );
    const content = readFileSync(briefPath(worktree, "g", "n"), "utf-8");
    expect(content).toContain("address: none");
  });

  it("projects one hypothesis notice while retaining canonical metadata and context scope", async () => {
    const hypothesis: Item = {
      kind: "decision",
      statement: "A retrieved item is not semantic truth",
      standing: "hypothesis",
      derivation: "agent:test-runtime:test-model",
    };
    const { repo, worktree } = fixture(v1WithContextSliceSection);
    const result = await writeBriefIntoWorktree(
      repo,
      worktree,
      "g",
      "n",
      "1".repeat(40),
      "session-1",
      standing,
      nodeGates,
      fakeSubstrateAt("http://fake-substrate.example", [addressedItem, hypothesis]),
    );
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    const content = readFileSync(briefPath(worktree, "g", "n"), "utf-8");
    expect(content.match(/Hypothesis items are unratified/g)).toHaveLength(1);
    expect(result.value.openingView?.match(/Hypothesis items are unratified/g)).toHaveLength(1);
    expect(result.value.openingView).toContain(
      "### Decision\n\n- [hypothesis] A retrieved item is not semantic truth\n" +
        "  derivation: agent:test-runtime:test-model",
    );
    expect(result.value.openingView).toContain("scope_count: 2");
    expect(result.value.openingView).toContain("context_scope:\n  - tracked.ts");
    const written = await readBriefFile(briefPath(worktree, "g", "n"));
    expect(isOk(written)).toBe(true);
    if (!isOk(written) || written.value.kind !== "v1") return;
    expect(written.value.frontMatter.scope).toEqual([
      ".interlock/sessions/g/n/brief.md",
      "tracked.ts",
    ]);
    expect(written.value.frontMatter.contextScope).toEqual(["tracked.ts"]);
  });
});

describe("withRenderedContextSlice", () => {
  it("replaces an appended section without duplicating it", () => {
    const first = withRenderedContextSlice("# brief", "first rendered item");
    const second = withRenderedContextSlice(first, "second rendered item");
    expect(second.match(/^## Context slice$/gm)).toHaveLength(1);
    expect(second).not.toContain("first rendered item");
    expect(contextSliceOf(second)).toContain("second rendered item");
  });
});

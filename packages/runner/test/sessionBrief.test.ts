import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isErr, isOk } from "@phyxiusjs/fp";
import { defaultRoleTable, type Item, readBriefFile } from "debrief";
import {
  explainGraphRefusal,
  type GateDeclaration,
  loadGraphDocumentText,
  NODE_ROLES,
  type NodeRole,
} from "face";
import { noneClient, type SubstrateClient } from "substrate";
import { afterEach, describe, expect, it } from "vitest";
import { contextSlice, contextSliceOf, withRenderedContextSlice } from "../src/contextSlice.ts";
import { buildOpeningPrompt } from "../src/openingPrompt.ts";
import { roleShapeFor } from "../src/roleShape.ts";
import {
  briefPath,
  buildBrief,
  explainSessionBriefRefusal,
  writeBriefIntoWorktree,
} from "../src/sessionBrief.ts";
import type { StandingGate } from "../src/standingGates.ts";
import { withWalkSection } from "../src/walkSection.ts";
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

  it("adds shared authoring guidance while retaining the authored body and ordinary opening", async () => {
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
    const writtenBody = content.slice(bodyStart);
    expect(writtenBody.startsWith(body)).toBe(true);
    expect(writtenBody.match(/^## Debrief authoring$/gm)).toHaveLength(1);
    expect(writtenBody).toContain(
      "applies_to: { kind: path, path: packages/substrate/src/evidence.ts }",
    );
    expect(writtenBody).toContain("interlock debrief preview --file <candidate>");
    expect(writtenBody).toContain("found_at: 'evidence.ts:2-3 \"durable exact excerpt\"'");
    expect(writtenBody).toContain("Review notes for discoveries worth handing on");
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.openingView?.endsWith(writtenBody)).toBe(true);
    expect(result.value.openingView).toContain("## Debrief authoring");
    expect(result.value.openingView).toContain("interlock debrief preview --file <candidate>");
    expect(result.value.openingView).toContain(
      "found_at: 'evidence.ts:2-3 \"durable exact excerpt\"'",
    );
    const opening = buildOpeningPrompt("g", "n", undefined, "worker", result.value.openingView);
    expect(opening).toContain("found_at: 'evidence.ts:2-3 \"durable exact excerpt\"'");
    expect(opening).toContain("interlock debrief preview --file <candidate>");
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

function fakeRefusalAt(address: string): SubstrateClient {
  return {
    address,
    context: () => Promise.resolve({ kind: "refused", because: "context is refused" }),
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
    const source = await readBriefFile(briefPath(repo, "g", "n"));
    if (!isOk(source) || source.value.kind !== "v1") throw new Error("expected v1");
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
    expect(body.startsWith(source.value.body)).toBe(true);
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

  it("retains the authored body and adds guidance after a refused unheaded context", async () => {
    const { repo, worktree } = fixture(v1WithMatchingGatesAndScope);
    const source = await readBriefFile(briefPath(repo, "g", "n"));
    if (!isOk(source) || source.value.kind !== "v1") throw new Error("expected v1");
    const result = await writeBriefIntoWorktree(
      repo,
      worktree,
      "g",
      "n",
      "f".repeat(40),
      "session-1",
      standing,
      nodeGates,
      fakeRefusalAt("http://refused-substrate.example"),
    );
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    const written = await readBriefFile(briefPath(worktree, "g", "n"));
    if (!isOk(written) || written.value.kind !== "v1") throw new Error("expected v1");
    expect(written.value.body.startsWith(source.value.body)).toBe(true);
    expect(written.value.body.match(/^## Debrief authoring$/gm)).toHaveLength(1);
    expect(written.value.body).not.toContain("## Context slice");
    expect(written.value.frontMatter.substrate.address).toBe("none");
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
  it("distinguishes an absent Context slice from a present empty slice", () => {
    expect(contextSlice("# brief")).toEqual({ kind: "absent" });
    expect(contextSlice("# brief\n\n## Context slice")).toEqual({ kind: "present", body: "" });
  });

  it("replaces an appended section without duplicating it", () => {
    const first = withRenderedContextSlice("# brief", "first rendered item");
    const second = withRenderedContextSlice(first, "second rendered item");
    expect(second.match(/^## Context slice$/gm)).toHaveLength(1);
    expect(second).not.toContain("first rendered item");
    expect(contextSliceOf(second)).toContain("second rendered item");
  });
});

describe("role supplied by the graph", () => {
  const graphText = (roleLine: readonly string[]): string =>
    [
      "interlock: graph@v0",
      "id: g",
      "nodes:",
      "  - id: n",
      ...roleLine,
      "    acceptance: do the work",
      "",
    ].join("\n");

  async function writeFor(roleLine: readonly string[], client: SubstrateClient = substrate) {
    const declaration = loadGraphDocumentText(graphText(roleLine), "g.yaml");
    if (isErr(declaration)) throw new Error(explainGraphRefusal(declaration.error));
    const node = declaration.value.nodes[0];
    if (node === undefined) throw new Error("expected node n");
    const { repo, worktree } = fixture(v1WithMatchingGatesAndScope);
    const result = await writeBriefIntoWorktree(
      repo,
      worktree,
      "g",
      "n",
      "b".repeat(40),
      "session-1",
      standing,
      nodeGates,
      client,
      node.role === undefined
        ? undefined
        : roleShapeFor(node.role, defaultRoleTable, client.address),
    );
    if (!isOk(result)) throw new Error("expected the brief to be written");
    return { node, result: result.value, worktree };
  }

  it("parses the graph's role and carries it into the brief, the ledger brief and the prompt", async () => {
    const { node, result, worktree } = await writeFor(["    role: tester"]);
    expect(node.role).toBe("tester");
    expect(result.narration).toContain(
      'role: the repository copy declared "worker"; the graph supplies "tester"; overwritten.',
    );

    const written = await readBriefFile(briefPath(worktree, "g", "n"));
    if (!isOk(written) || written.value.kind !== "v1") throw new Error("expected v1");
    expect(written.value.frontMatter.role).toBe("tester");
    expect(result.openingView).toContain("role: tester");

    const role = node.role ?? "worker";
    expect(buildBrief("g", "n", "do the work", [], [], role).role).toBe("tester");
    const prompt = buildOpeningPrompt("g", "n", undefined, role, result.openingView);
    expect(prompt).toContain(`${defaultRoleTable.tester.prompt} `);
    expect(prompt).toContain("For a first filing, run interlock debrief prepare g n");
  });

  it("keeps the repository copy's brief byte for byte when the graph names no role", async () => {
    const { node, result, worktree } = await writeFor([]);
    expect(node.role).toBeUndefined();
    expect(result.narration).toEqual(["context none: no substrate addressed"]);

    const bytes = readFileSync(briefPath(worktree, "g", "n"), "utf-8");
    expect(
      bytes.startsWith(
        [
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
          `graph_base_sha: ${"b".repeat(40)}`,
          "session: session-1",
          "---",
          "",
          "# brief",
          "",
        ].join("\n"),
      ),
    ).toBe(true);

    const role = node.role ?? "worker";
    expect(buildBrief("g", "n", "do the work", [], []).role).toBe("worker");
    expect(buildOpeningPrompt("g", "n", undefined, role, result.openingView)).toBe(
      buildOpeningPrompt("g", "n", undefined, undefined, result.openingView),
    );
    expect(buildOpeningPrompt("g", "n", undefined, role)).not.toContain("Your role is");
  });

  it("refuses an unknown role in the graph with a sentence naming the nearest role", () => {
    const loaded = loadGraphDocumentText(graphText(["    role: reviwer"]), "g.yaml");
    if (!isErr(loaded)) throw new Error("expected a refusal");
    expect(explainGraphRefusal(loaded.error)).toBe(
      'g.yaml: node "n": role "reviwer" is not one of scout, planner, implementer, tester, reviewer, verifier; the nearest is "reviewer"',
    );
  });

  const paragraphs: Readonly<Record<NodeRole, string>> = {
    scout:
      "Your role is scout: you read and report, and change nothing. Your debrief returns discoveries, each with where you found it, and no diff: no decision cites a hunk.",
    planner:
      "Your role is planner: you draft a graph for a person to approve. Commit it under .interlock/graphs/ and name it in your debrief's graph_file; a person approves it, never you.",
    implementer:
      "Your role is implementer: you produce the diff. Your debrief returns decisions, each rooted in the hunks it produced.",
    tester:
      "Your role is tester: you produce the proof the gates run. Your debrief returns proof: each test, the gate that runs it, and what it pins.",
    reviewer:
      "Your role is reviewer: you produce a judgment through a named lens. Your debrief names the lens and returns findings through it, each with where you found it, and no diff: no decision cites a hunk.",
    verifier:
      "Your role is verifier: you produce the check that every debrief claim is rooted. Your debrief returns marks: each claim with rooted, unrooted, unexplained or gap, and why.",
  };

  it.each(NODE_ROLES)("opens a %s session with its role paragraph", (role) => {
    const paragraph = paragraphs[role];
    expect(defaultRoleTable[role].prompt).toBe(paragraph);
    expect(buildOpeningPrompt("g", "n", undefined, role)).toContain(
      `Work only in this worktree. ${paragraph} Append`,
    );
    expect(
      buildOpeningPrompt("g", "n", undefined, role, undefined, "A repository's own paragraph."),
    ).toContain("Work only in this worktree. A repository's own paragraph. Append");
  });
});

describe("the role shapes the session's walk", () => {
  const graphText = (role: string): string =>
    [
      "interlock: graph@v0",
      "id: g",
      "nodes:",
      "  - id: n",
      `    role: ${role}`,
      "    acceptance: do the work",
      "",
    ].join("\n");

  const addressed: SubstrateClient = { ...noneClient(), address: "https://substrate.test" };

  async function writeRole(role: string, client: SubstrateClient) {
    const loaded = loadGraphDocumentText(graphText(role), "g.yaml");
    if (isErr(loaded)) throw new Error(explainGraphRefusal(loaded.error));
    const nodeRole = loaded.value.nodes[0]?.role;
    if (nodeRole === undefined) throw new Error("expected a role");
    const shape = roleShapeFor(nodeRole, defaultRoleTable, client.address);
    const { repo, worktree } = fixture(v1WithMatchingGatesAndScope);
    const result = await writeBriefIntoWorktree(
      repo,
      worktree,
      "g",
      "n",
      "b".repeat(40),
      "session-1",
      standing,
      nodeGates,
      client,
      shape,
    );
    if (!isOk(result)) throw new Error("expected the brief to be written");
    const read = await readBriefFile(briefPath(worktree, "g", "n"));
    if (!isOk(read) || read.value.kind !== "v1") throw new Error("expected v1");
    return { shape, read: read.value, openingView: result.value.openingView ?? "" };
  }

  it.each(NODE_ROLES)("asks the %s walk first, by verb, through the address", async (role) => {
    const { shape, read, openingView } = await writeRole(role, addressed);
    const steps = defaultRoleTable[role].walk;
    expect(steps.length).toBeGreaterThan(0);
    expect(shape.walk).toEqual({ kind: "address", address: "https://substrate.test", steps });
    expect(read.frontMatter.walk).toEqual(shape.walk);
    expect(read.body).toContain(`Role: ${role}.`);
    expect(read.body).toContain(
      "Ask the substrate at https://substrate.test these first, by verb:",
    );
    for (const [index, step] of steps.entries()) {
      expect(read.body).toContain(`${index + 1}. ${step.verb}: ${step.ask}`);
    }
    expect(read.body).toContain(
      "The walk is a starting point, never a fence: the whole substrate is open to this session through its address https://substrate.test, so any role may walk anywhere it wants.",
    );
    expect(openingView).toContain("walk:");
  });

  it.each(NODE_ROLES)(
    "gives the %s session an empty walk that says so when the address is none",
    async (role) => {
      const { shape, read } = await writeRole(role, substrate);
      expect(shape.walk).toEqual({
        kind: "none",
        because: "the substrate address is none, so there is nothing to ask",
      });
      expect(read.frontMatter.walk).toEqual(shape.walk);
      expect(read.body).toContain(
        "This walk is empty: the substrate address is none, so there is nothing to ask. Nothing here errors; the session runs without a substrate.",
      );
      expect(read.body).not.toContain("Ask the substrate at");
    },
  );

  it("rewrites the walk section in place when a brief is written again", async () => {
    const { read } = await writeRole("tester", addressed);
    const shape = roleShapeFor("tester", defaultRoleTable, "none");
    const again = withWalkSection(read.body, shape);
    expect(again.match(/^## Walk$/gm)).toHaveLength(1);
    expect(again).toContain("This walk is empty");
    expect(again).not.toContain("Ask the substrate at");
  });
});

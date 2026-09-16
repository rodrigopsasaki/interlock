import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isOk } from "@phyxiusjs/fp";
import { readDebriefDocument } from "debrief";
import { derivation, mark } from "ledger";
import { evidenceOf, toWireDebrief } from "substrate";
import { verifyDebrief } from "verifier";
import { afterEach, describe, expect, it } from "vitest";
import {
  debriefAuthoringGuidance,
  pathAppliesToExample,
  rangedDiscoveryExample,
  rangedDiscoveryFoundAt,
  repositoryAppliesToExample,
  withDebriefAuthoringGuidance,
} from "../src/debriefAuthoringGuidance.ts";
import { interpreterBriefBody } from "../src/interpreterBrief.ts";
import { buildOpeningPrompt } from "../src/openingPrompt.ts";
import { commitAll, gitInitFixtureWithContent, headSha } from "./support/gitFixture.ts";

const SHA = "a".repeat(40);
const verifier = derivation.gate("verifier-hunks", "verifier@0", "test");
const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function discoveryDocument(
  graphBaseSha: string,
  sessionStartSha: string,
  headSha: string,
  discoveryExample: string,
): string {
  return [
    "interlock: debrief@v2",
    "graph: g",
    "node: n",
    "role: worker",
    `graph_base_sha: ${graphBaseSha}`,
    `session_start_sha: ${sessionStartSha}`,
    `head_sha: ${headSha}`,
    "derivation:",
    "  kind: agent",
    "  runtime: fixture",
    "  model: fixture",
    discoveryExample,
    "decisions: []",
    "gates_run_by_agent: []",
    "open: []",
    "",
  ].join("\n");
}

function decisionFromExample(example: string) {
  const read = readDebriefDocument(
    [
      "interlock: debrief@v2",
      "graph: g",
      "node: n",
      "role: worker",
      `graph_base_sha: ${SHA}`,
      `session_start_sha: ${SHA}`,
      `head_sha: ${SHA}`,
      "derivation:",
      "  kind: agent",
      "  runtime: codex",
      "  model: gpt-5.6-terra",
      "discoveries: []",
      "decisions:",
      "  - id: c1",
      "    what: Keep support distinct from usefulness.",
      "    because: The author names applicability separately.",
      "    rests_on: [notes:choice]",
      "    hunks: [notes.yaml]",
      `    ${example}`,
      "gates_run_by_agent: []",
      "open: []",
      "",
    ].join("\n"),
    "example.yaml",
  );
  if (!isOk(read) || read.value.kind !== "v2") throw new Error("expected a valid debrief example");
  const decision = read.value.debrief.decisions[0];
  if (decision === undefined) throw new Error("expected the example decision");
  return { debrief: read.value.debrief, decision };
}

describe("debrief authoring guidance", () => {
  it("shows separate reader-valid path and repository alternatives without making either required", () => {
    expect(debriefAuthoringGuidance).toContain(pathAppliesToExample);
    expect(debriefAuthoringGuidance).toContain(repositoryAppliesToExample);
    expect(debriefAuthoringGuidance).toContain("Omit `applies_to` when no target is warranted");
    expect(debriefAuthoringGuidance).toContain("never supplies support or ratifies a claim");
    expect(debriefAuthoringGuidance).toContain(rangedDiscoveryExample);
    expect(debriefAuthoringGuidance).toContain("A bare ranged");
    expect(debriefAuthoringGuidance).toContain("Review notes for discoveries worth handing on");
    expect(debriefAuthoringGuidance).toContain("No discovery, no justified applicability");
    expect(debriefAuthoringGuidance).toContain("interlock debrief preview --file <candidate>");
    expect(decisionFromExample(pathAppliesToExample).decision.appliesTo).toEqual({
      kind: "path",
      path: "packages/substrate/src/evidence.ts",
    });
    expect(decisionFromExample(repositoryAppliesToExample).decision.appliesTo).toEqual({
      kind: "repository",
    });
  });

  it("parses and verifies the exported ranged discovery example at its authored Git head", async () => {
    directory = mkdtempSync(join(runsRoot, "authoring-feedback-"));
    writeFileSync(join(directory, "AGENTS.md"), "# Fixture\n");
    gitInitFixtureWithContent(directory);
    const from = headSha(directory);
    writeFileSync(
      join(directory, "evidence.ts"),
      "opening line\ndurable exact excerpt\nclosing line\n",
    );
    commitAll(directory, "add fixture evidence");
    const sha = headSha(directory);
    const parsed = readDebriefDocument(
      discoveryDocument(from, from, sha, rangedDiscoveryExample),
      "candidate.yaml",
    );
    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed) || parsed.value.kind !== "v2") return;
    const verified = await verifyDebrief(directory, parsed.value.debrief, { runner: "fixture" });
    expect(isOk(verified)).toBe(true);
    if (!isOk(verified)) return;
    expect(verified.value.discoveryMarks[0]?.mark.kind).toBe("rooted");

    const wrongQuote = readDebriefDocument(
      discoveryDocument(
        from,
        from,
        sha,
        rangedDiscoveryExample.replace(rangedDiscoveryFoundAt, 'evidence.ts:2-3 "wrong excerpt"'),
      ),
      "wrong-quote.yaml",
    );
    expect(isOk(wrongQuote)).toBe(true);
    if (!isOk(wrongQuote) || wrongQuote.value.kind !== "v2") return;
    expect(wrongQuote.value.debrief.discoveries[0]?.foundAt).toBe(
      'evidence.ts:2-3 "wrong excerpt"',
    );
    const wrongQuoteVerified = await verifyDebrief(directory, wrongQuote.value.debrief, {
      runner: "fixture",
    });
    expect(isOk(wrongQuoteVerified)).toBe(true);
    if (!isOk(wrongQuoteVerified)) return;
    expect(wrongQuoteVerified.value.discoveryMarks[0]?.mark).toEqual(
      expect.objectContaining({ kind: "unrooted" }),
    );

    const missingQuote = readDebriefDocument(
      discoveryDocument(
        from,
        from,
        sha,
        rangedDiscoveryExample.replace(rangedDiscoveryFoundAt, "evidence.ts:2-3"),
      ),
      "missing-quote.yaml",
    );
    expect(isOk(missingQuote)).toBe(true);
    if (!isOk(missingQuote) || missingQuote.value.kind !== "v2") return;
    const missingQuoteVerified = await verifyDebrief(directory, missingQuote.value.debrief, {
      runner: "fixture",
    });
    expect(isOk(missingQuoteVerified)).toBe(true);
    if (!isOk(missingQuoteVerified)) return;
    expect(missingQuoteVerified.value.discoveryMarks[0]?.mark.kind).toBe("unrooted");
  });

  it("is present once in interpreter briefs while retaining received context and correction bytes", () => {
    const context = "### Decision\n\n- [hypothesis] Check this\n  derivation: human:Pat";
    const previousGraphYaml = "interlock: graph@v0\nid: old\n";
    const body = interpreterBriefBody("g", "plan/g", "Plan this.", context, {
      reason: "The prior graph needs correction.",
      previousGraphYaml,
    });
    expect(body.match(/^## Debrief authoring$/gm)).toHaveLength(1);
    expect(body).toContain("interlock debrief preview --file <candidate>");
    expect(body).toContain(rangedDiscoveryExample);
    expect(body).toContain(context);
    expect(body).toContain(previousGraphYaml);
    const opening = buildOpeningPrompt("g", "plan/g", undefined, "interpreter", body);
    expect(opening).toContain(rangedDiscoveryExample);
    expect(opening).toContain("interlock debrief preview --file <candidate>");
  });

  it("preserves authored matching headings and quoted marker pairs in fences, then is idempotent", () => {
    const authored = [
      "# Brief",
      "",
      "## Debrief authoring",
      "",
      "This heading belongs to the author.",
      "",
      "```md",
      "## Debrief authoring",
      "This fenced heading also belongs to the author.",
      "```",
      "",
      "```md",
      "<!-- interlock: debrief-authoring-guidance@v1:start -->",
      "quoted marker pair remains authored",
      "<!-- interlock: debrief-authoring-guidance@v1:end -->",
      "````",
      "",
      "```md",
      "``` not a close",
      "<!-- interlock: debrief-authoring-guidance@v1:start -->",
      "quoted backtick-fence marker pair remains authored",
      "<!-- interlock: debrief-authoring-guidance@v1:end -->",
      "```",
      "",
      "~~~md",
      "<!-- interlock: debrief-authoring-guidance@v1:start -->",
      "quoted tilde-fence marker pair remains authored",
      "<!-- interlock: debrief-authoring-guidance@v1:end -->",
      "~~~~",
      "",
      "~~~md",
      "~~~ not a close",
      "<!-- interlock: debrief-authoring-guidance@v1:start -->",
      "quoted tilde-fence marker pair remains authored",
      "<!-- interlock: debrief-authoring-guidance@v1:end -->",
      "~~~",
      "",
      "## Context slice",
      "",
      "received exactly",
      "",
    ].join("\n");
    const first = withDebriefAuthoringGuidance(authored);
    const second = withDebriefAuthoringGuidance(first);
    expect(first.startsWith(authored)).toBe(true);
    expect(second).toBe(first);
    expect(second.match(/^## Debrief authoring$/gm)).toHaveLength(3);
    expect(second.match(/debrief-authoring-guidance@v1:start/g)).toHaveLength(5);
    expect(second).toContain("## Context slice\n\nreceived exactly");
  });

  it("uses rooted evidence for applicability translation, retains omitted support scope, and excludes unrooted claims", () => {
    const { debrief, decision } = decisionFromExample(pathAppliesToExample);
    expect(toWireDebrief(debrief).decisions[0]?.applies_to).toEqual(decision.appliesTo);

    const base = {
      derivation: debrief.derivation,
      discoveries: [],
      receipts: [],
      personEvents: [],
      harnessAuthorities: new Set<string>(),
    };
    const rooted = evidenceOf({
      ...base,
      decisions: [{ decision, marks: [mark.rooted(verifier, "notes.yaml")] }],
    });
    expect(rooted.items[0]?.scope).toEqual({
      kind: "path",
      path: "packages/substrate/src/evidence.ts",
    });

    const { appliesTo: _omitted, ...withoutApplicability } = decision;
    const omitted = evidenceOf({
      ...base,
      decisions: [{ decision: withoutApplicability, marks: [mark.rooted(verifier, "notes.yaml")] }],
    });
    expect(omitted.items[0]?.scope).toEqual({ kind: "path", path: "notes.yaml" });

    const unrooted = evidenceOf({
      ...base,
      decisions: [{ decision, marks: [mark.unrooted(verifier, "support is unavailable")] }],
    });
    expect(unrooted.items).toEqual([]);
  });
});

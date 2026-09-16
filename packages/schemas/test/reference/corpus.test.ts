import { mkdirSync, mkdtempSync, readdirSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildCorpusExamples, type ReferenceSource } from "../../src/reference/corpus.ts";

const runsRoot = join(import.meta.dirname, "..", ".runs");
mkdirSync(runsRoot, { recursive: true });

let runDirectory: string | undefined;

afterEach(() => {
  if (runDirectory !== undefined) {
    for (const entry of readdirSync(runDirectory)) rmSync(join(runDirectory, entry));
    rmdirSync(runDirectory);
  }
  runDirectory = undefined;
});

const selected: readonly ReferenceSource[] = [{ sourcePath: "published.yaml", tag: "debrief@v2" }];

function validDebrief(open: string): string {
  return [
    "interlock: debrief@v2",
    "graph: g",
    "node: n",
    "role: worker",
    `graph_base_sha: ${"a".repeat(40)}`,
    `session_start_sha: ${"b".repeat(40)}`,
    `head_sha: ${"c".repeat(40)}`,
    "derivation:",
    "  kind: agent",
    "  runtime: codex",
    "  model: gpt-5.6-terra",
    "discoveries: []",
    "decisions: []",
    "gates_run_by_agent: []",
    `open: ${open}`,
    "",
  ].join("\n");
}

function startFixture(): string {
  runDirectory = mkdtempSync(join(runsRoot, "reference-"));
  return runDirectory;
}

function writeFixture(root: string, sourcePath: string, content: string): void {
  writeFileSync(join(root, sourcePath), content);
}

describe("reference corpus selections", () => {
  it("keeps the selected example when a smaller valid debrief arrives", () => {
    const root = startFixture();
    const publishedPath = selected[0]?.sourcePath;
    expect(publishedPath).toBeDefined();
    if (publishedPath === undefined) return;
    const published = validDebrief('["published example retains deliberately chosen provenance"]');
    const unrelated = validDebrief("[]");
    writeFixture(root, publishedPath, published);

    const before = buildCorpusExamples(root, selected);

    writeFixture(root, "unrelated.yaml", unrelated);
    expect(unrelated.length).toBeLessThan(published.length);
    const after = buildCorpusExamples(root, selected);

    expect(after).toEqual(before);
    expect(after.get("debrief@v2")?.sourcePath).toBe(publishedPath);
  });

  it("rejects a missing selected source", () => {
    const root = startFixture();

    expect(() => buildCorpusExamples(root, selected)).toThrow(
      'Reference source "published.yaml" for "debrief@v2" does not exist.',
    );
  });

  it("rejects a selected source that carries another shape", () => {
    const root = startFixture();
    const publishedPath = selected[0]?.sourcePath;
    expect(publishedPath).toBeDefined();
    if (publishedPath === undefined) return;
    writeFixture(root, publishedPath, "interlock: notes@v0\nnode: n\nentries: []\n");

    expect(() => buildCorpusExamples(root, selected)).toThrow(
      'Reference source "published.yaml" does not carry expected shape "debrief@v2".',
    );
  });

  it("rejects a selected source that does not validate its expected shape", () => {
    const root = startFixture();
    const publishedPath = selected[0]?.sourcePath;
    expect(publishedPath).toBeDefined();
    if (publishedPath === undefined) return;
    writeFixture(root, publishedPath, "interlock: debrief@v2\n");

    expect(() => buildCorpusExamples(root, selected)).toThrow(
      'Reference source "published.yaml" selects invalid "debrief@v2":',
    );
  });
});

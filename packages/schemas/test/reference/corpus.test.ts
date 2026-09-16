import { existsSync, mkdirSync, mkdtempSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildCorpusExamples, type ReferenceSource } from "../../src/reference/corpus.ts";

const runsRoot = join(import.meta.dirname, "..", ".runs");
mkdirSync(runsRoot, { recursive: true });

let runDirectory: string | undefined;
let fixturePaths: string[] = [];
let fixtureDirectories: string[] = [];

afterEach(() => {
  if (runDirectory !== undefined) {
    for (const path of fixturePaths.toReversed()) {
      if (existsSync(path)) rmSync(path);
    }
    for (const directory of fixtureDirectories.toSorted((a, b) => b.length - a.length)) {
      if (existsSync(directory)) rmdirSync(directory);
    }
    rmdirSync(runDirectory);
  }
  runDirectory = undefined;
  fixturePaths = [];
  fixtureDirectories = [];
});

const publishedSource: ReferenceSource = {
  sourcePath: ".interlock/sessions/published/node/debrief.yaml",
  tag: "debrief@v2",
};
const selected: readonly ReferenceSource[] = [publishedSource];
const unrelatedSource = ".interlock/sessions/new/node/debrief.yaml";

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
  const path = join(root, sourcePath);
  let directory = dirname(path);
  while (directory !== root) {
    fixtureDirectories.push(directory);
    directory = dirname(directory);
  }
  mkdirSync(dirname(path), { recursive: true });
  fixturePaths.push(path);
  writeFileSync(path, content);
}

describe("reference corpus selections", () => {
  it("keeps the selected example when a smaller valid debrief arrives", () => {
    const root = startFixture();
    const published = validDebrief('["published example retains deliberately chosen provenance"]');
    const unrelated = validDebrief("[]");
    writeFixture(root, publishedSource.sourcePath, published);

    const before = buildCorpusExamples(root, selected);

    writeFixture(root, unrelatedSource, unrelated);
    expect(unrelated.length).toBeLessThan(published.length);
    const after = buildCorpusExamples(root, selected);

    expect(after).toEqual(before);
    expect(after.get("debrief@v2")?.sourcePath).toBe(publishedSource.sourcePath);
  });

  it("rejects a missing selected source", () => {
    const root = startFixture();

    expect(() => buildCorpusExamples(root, selected)).toThrow(
      'Reference source ".interlock/sessions/published/node/debrief.yaml" for "debrief@v2" does not exist.',
    );
  });

  it("rejects a selected source that carries another shape", () => {
    const root = startFixture();
    writeFixture(root, publishedSource.sourcePath, "interlock: notes@v0\nnode: n\nentries: []\n");

    expect(() => buildCorpusExamples(root, selected)).toThrow(
      'Reference source ".interlock/sessions/published/node/debrief.yaml" does not carry expected shape "debrief@v2".',
    );
  });

  it("rejects a selected source that does not validate its expected shape", () => {
    const root = startFixture();
    writeFixture(root, publishedSource.sourcePath, "interlock: debrief@v2\n");

    expect(() => buildCorpusExamples(root, selected)).toThrow(
      'Reference source ".interlock/sessions/published/node/debrief.yaml" selects invalid "debrief@v2":',
    );
  });
});

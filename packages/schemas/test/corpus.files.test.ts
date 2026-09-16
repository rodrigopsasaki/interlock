import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildRegistry } from "../src/registry.ts";
import { describeFileValidation, isRefusal, validateFile } from "../src/validate.ts";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const interlockDir = join(repoRoot, ".interlock");
const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let runDirectory: string | undefined;

afterEach(() => {
  if (runDirectory !== undefined) rmSync(runDirectory, { recursive: true, force: true });
  runDirectory = undefined;
});

function filesUnder(directory: string): readonly string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(path));
    else files.push(path);
  }
  return files;
}

const VALIDATABLE = new Set([".yaml", ".yml", ".md", ".jsonl"]);

const corpus = filesUnder(interlockDir).filter((path) =>
  VALIDATABLE.has(path.slice(path.lastIndexOf("."))),
);

type RetainedHistory =
  | { readonly kind: "ordinary" }
  | { readonly kind: "retained" }
  | { readonly kind: "rejected"; readonly because: string };

function retainedHistory(path: string, root: string): RetainedHistory {
  const parts = relative(root, path).split(sep);
  if (
    parts.length !== 5 ||
    parts[0] !== "sessions" ||
    parts[1] === "" ||
    parts[2] === "" ||
    parts[3] !== "revisions"
  ) {
    return { kind: "ordinary" };
  }

  const name = parts[4];
  if (name === undefined || !/^[a-f0-9]{64}\.yaml$/.test(name)) return { kind: "ordinary" };

  const status = lstatSync(path);
  if (!status.isFile()) return { kind: "rejected", because: "is not a regular revision file" };

  const expected = name.slice(0, 64);
  const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
  return actual === expected
    ? { kind: "retained" }
    : { kind: "rejected", because: "does not match its SHA-256 filename" };
}

function corpusAccepts(history: RetainedHistory, refused: boolean): boolean {
  return history.kind === "retained" || (history.kind === "ordinary" && !refused);
}

function historyDetail(history: RetainedHistory): string {
  return history.kind === "rejected" ? history.because : history.kind;
}

function invalidV2(): string {
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
    "  reasoning_effort: high",
    "discoveries: []",
    "decisions: []",
    "gates_run_by_agent: []",
    "open: []",
    "",
  ].join("\n");
}

function validV2(): string {
  return invalidV2().replace("  reasoning_effort: high\n", "");
}

function writeHistoryFixture(path: string, body: string): void {
  mkdirSync(join(path, ".interlock", "sessions", "g", "n", "revisions"), { recursive: true });
  writeFileSync(join(path, ".interlock", "sessions", "g", "n", "debrief.yaml"), body);
}

describe("corpus: every real file under .interlock validates against its schema", () => {
  it("found at least one file of every kind this repository actually carries", () => {
    expect(corpus.length).toBeGreaterThan(0);
  });

  const registry = buildRegistry();
  for (const path of corpus) {
    it(`${path.slice(repoRoot.length + 1)} validates`, async () => {
      const result = await validateFile(registry, path);
      const { exitCode, message } = describeFileValidation(result);
      const refused = result.lines.some((line) => isRefusal(line.outcome));
      const history = retainedHistory(path, interlockDir);
      const detail = history.kind === "rejected" ? `${message} ${history.because}` : message;
      expect(corpusAccepts(history, refused), detail).toBe(true);
      expect(exitCode === 0 || history.kind === "retained", detail).toBe(true);
    });
  }

  it("keeps an exact invalid revision while rejecting current, moved, renamed, and tampered copies", async () => {
    runDirectory = mkdtempSync(join(runsRoot, "corpus-"));
    const body = invalidV2();
    writeHistoryFixture(runDirectory, body);
    const fixtureRoot = join(runDirectory, ".interlock");
    const current = join(fixtureRoot, "sessions", "g", "n", "debrief.yaml");
    const revisions = join(fixtureRoot, "sessions", "g", "n", "revisions");
    const digest = createHash("sha256").update(body).digest("hex");
    const retained = join(revisions, `${digest}.yaml`);
    const moved = join(fixtureRoot, "moved.yaml");
    const renamed = join(revisions, "debrief-1.yaml");
    const tampered = join(revisions, `${"0".repeat(64)}.yaml`);
    writeFileSync(retained, body);
    writeFileSync(moved, body);
    writeFileSync(renamed, body);
    writeFileSync(tampered, body);

    const direct = await validateFile(registry, retained);
    expect(direct.lines.some((line) => isRefusal(line.outcome))).toBe(true);

    for (const path of [current, moved, renamed, tampered]) {
      const result = await validateFile(registry, path);
      const refused = result.lines.some((line) => isRefusal(line.outcome));
      const history = retainedHistory(path, fixtureRoot);
      expect(corpusAccepts(history, refused), historyDetail(history)).toBe(false);
    }

    const history = retainedHistory(retained, fixtureRoot);
    expect(corpusAccepts(history, true), historyDetail(history)).toBe(true);
  });

  it("rejects a symbolic-link revision even when its target has a matching name", async () => {
    runDirectory = mkdtempSync(join(runsRoot, "corpus-"));
    const body = validV2();
    writeHistoryFixture(runDirectory, body);
    const fixtureRoot = join(runDirectory, ".interlock");
    const revisions = join(fixtureRoot, "sessions", "g", "n", "revisions");
    const digest = createHash("sha256").update(body).digest("hex");
    const target = join(runDirectory, "target.yaml");
    const revision = join(revisions, `${digest}.yaml`);
    writeFileSync(target, body);
    symlinkSync(target, revision);

    const result = await validateFile(registry, revision);
    const refused = result.lines.some((line) => isRefusal(line.outcome));
    expect(refused).toBe(false);
    const history = retainedHistory(revision, fixtureRoot);
    expect(corpusAccepts(history, refused), historyDetail(history)).toBe(false);
  });
});

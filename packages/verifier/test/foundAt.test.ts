import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { derivation } from "ledger";
import { afterEach, describe, expect, it } from "vitest";
import { checkFoundAt } from "../src/foundAt.ts";
import { commitAll, gitInitFixture } from "./support/gitFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

const DERIVATION = derivation.gate("verifier-hunks", "verifier@0", "test");

function repoWithSession(): { readonly dir: string; readonly sha: string } {
  directory = mkdtempSync(join(runsRoot, "run-"));
  gitInitFixture(directory);
  mkdirSync(join(directory, "packages/ledger/src"), { recursive: true });
  writeFileSync(
    join(directory, "packages/ledger/src/mark.ts"),
    [
      'export const rooted = "rooted";',
      'export const boundary = "edge";',
      'export const stale = "before";',
      "",
    ].join("\n"),
  );
  writeFileSync(join(directory, "crlf.ts"), "first\r\nsecond\r\nthird\r\n");
  mkdirSync(join(directory, ".interlock/sessions/0001-bootstrap/other"), {
    recursive: true,
  });
  writeFileSync(
    join(directory, ".interlock/sessions/0001-bootstrap/other/notes.yaml"),
    "entries:\n  - kind: choice\n",
  );
  const sha = commitAll(directory, "root");
  return { dir: directory, sha };
}

describe("checkFoundAt", () => {
  it("roots a command-form citation without checking its content", () => {
    const { dir, sha } = repoWithSession();
    const result = checkFoundAt(
      "$ mise exec -- pnpm test\nall green\n",
      dir,
      sha,
      "0001-bootstrap",
      DERIVATION,
    );
    expect(result.kind).toBe("rooted");
  });

  it("roots a repo-root-relative path embedded in prose, no quote to check", () => {
    const { dir, sha } = repoWithSession();
    const result = checkFoundAt(
      "packages/ledger/src/mark.ts's Mark type, read before writing this.",
      dir,
      sha,
      "0001-bootstrap",
      DERIVATION,
    );
    expect(result.kind).toBe("rooted");
  });

  it("roots a path that only resolves relative to the graph's sessions directory", () => {
    const { dir, sha } = repoWithSession();
    const result = checkFoundAt(
      "other/notes.yaml entries 1 and 2.",
      dir,
      sha,
      "0001-bootstrap",
      DERIVATION,
    );
    expect(result.kind).toBe("rooted");
  });

  it("roots a path with a quote that is present in the file", () => {
    const { dir, sha } = repoWithSession();
    const result = checkFoundAt(
      'packages/ledger/src/mark.ts, the string "rooted".',
      dir,
      sha,
      "0001-bootstrap",
      DERIVATION,
    );
    expect(result.kind).toBe("rooted");
  });

  it("unroots a path with a quote that is not present in the file", () => {
    const { dir, sha } = repoWithSession();
    const result = checkFoundAt(
      'packages/ledger/src/mark.ts, the string "nowhere".',
      dir,
      sha,
      "0001-bootstrap",
      DERIVATION,
    );
    expect(result.kind).toBe("unrooted");
  });

  it("roots a single explicit line only when its quote occurs in that line", () => {
    const { dir, sha } = repoWithSession();
    const result = checkFoundAt(
      'packages/ledger/src/mark.ts:1 "export const rooted"',
      dir,
      sha,
      "0001-bootstrap",
      DERIVATION,
    );
    expect(result).toEqual(
      expect.objectContaining({ kind: "rooted", hunk: "packages/ledger/src/mark.ts" }),
    );
  });

  it("roots an explicit range, including a citation path wrapped in backticks", () => {
    const { dir, sha } = repoWithSession();
    const result = checkFoundAt(
      '`packages/ledger/src/mark.ts:1-2` "export const boundary"',
      dir,
      sha,
      "0001-bootstrap",
      DERIVATION,
    );
    expect(result).toEqual(
      expect.objectContaining({ kind: "rooted", hunk: "packages/ledger/src/mark.ts" }),
    );
  });

  it("counts CRLF source lines when checking an explicit location", () => {
    const { dir, sha } = repoWithSession();
    const result = checkFoundAt('crlf.ts:2 "second"', dir, sha, "0001-bootstrap", DERIVATION);
    expect(result).toEqual(expect.objectContaining({ kind: "rooted", hunk: "crlf.ts" }));
  });

  it("unroots an explicit quote outside its declared range even when it appears elsewhere", () => {
    const { dir, sha } = repoWithSession();
    const result = checkFoundAt(
      'packages/ledger/src/mark.ts:1 "before"',
      dir,
      sha,
      "0001-bootstrap",
      DERIVATION,
    );
    expect(result.kind).toBe("unrooted");
  });

  it("unroots malformed, invalid, out-of-bounds, and unresolved explicit locations", () => {
    const { dir, sha } = repoWithSession();
    const locations = [
      'packages/ledger/src/mark.ts:0 "rooted"',
      'packages/ledger/src/mark.ts:-1 "rooted"',
      'packages/ledger/src/mark.ts:2-1 "rooted"',
      'packages/ledger/src/mark.ts:5 "rooted"',
      'packages/ledger/src/mark.ts:1- "rooted"',
      'missing.ts:1 "rooted"',
    ];
    for (const foundAt of locations) {
      expect(checkFoundAt(foundAt, dir, sha, "0001-bootstrap", DERIVATION).kind).toBe("unrooted");
    }
  });

  it("unroots ambiguous explicit citations and never borrows another quote", () => {
    const { dir, sha } = repoWithSession();
    const result = checkFoundAt(
      'packages/ledger/src/mark.ts:1 "rooted" crlf.ts:2 "second"',
      dir,
      sha,
      "0001-bootstrap",
      DERIVATION,
    );
    expect(result.kind).toBe("unrooted");
  });

  it("requires a separate quote when a backtick-wrapped path supplies the explicit location", () => {
    const { dir, sha } = repoWithSession();
    const result = checkFoundAt(
      "`packages/ledger/src/mark.ts:1`",
      dir,
      sha,
      "0001-bootstrap",
      DERIVATION,
    );
    expect(result.kind).toBe("unrooted");
  });

  it("counts a backtick code excerpt with nested double quotes as one quotation", () => {
    const { dir, sha } = repoWithSession();
    const result = checkFoundAt(
      'packages/ledger/src/mark.ts:1 `export const rooted = "rooted";`',
      dir,
      sha,
      "0001-bootstrap",
      DERIVATION,
    );
    expect(result.kind).toBe("rooted");
  });

  it("reads explicit source from the supplied head rather than working-tree content", () => {
    const { dir, sha } = repoWithSession();
    writeFileSync(join(dir, "packages/ledger/src/mark.ts"), "working tree changed\n");
    const result = checkFoundAt(
      'packages/ledger/src/mark.ts:2 "export const boundary"',
      dir,
      sha,
      "0001-bootstrap",
      DERIVATION,
    );
    expect(result.kind).toBe("rooted");
  });

  it("roots a quoted out-of-band citation with no resolvable path", () => {
    const { dir, sha } = repoWithSession();
    const result = checkFoundAt(
      'grepping "because:" across four legacy fixtures -- 35/35, 46/46.',
      dir,
      sha,
      "0001-bootstrap",
      DERIVATION,
    );
    expect(result.kind).toBe("rooted");
  });

  it("unroots free text with no path, command, or quote", () => {
    const { dir, sha } = repoWithSession();
    const result = checkFoundAt(
      "a conversation with the reviewer about naming.",
      dir,
      sha,
      "0001-bootstrap",
      DERIVATION,
    );
    expect(result.kind).toBe("unrooted");
  });
});

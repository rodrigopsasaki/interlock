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
  writeFileSync(join(directory, "no-final-newline.ts"), "first\nlast exact");
  writeFileSync(join(directory, "evidence.txt"), "opening\nother.ts:2\nclosing\n");
  writeFileSync(join(directory, "other.ts"), "opening\nother.ts:2\nclosing\n");
  writeFileSync(join(directory, "Makefile"), "build:\n\t@echo ready\n");
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

  it("preserves embedded known-path backtick locators and their range refusal", () => {
    const { dir, sha } = repoWithSession();
    const valid = checkFoundAt(
      'See `packages/ledger/src/mark.ts:1` "export const rooted"',
      dir,
      sha,
      "0001-bootstrap",
      DERIVATION,
    );
    const invalid = checkFoundAt(
      'See `packages/ledger/src/mark.ts:999` "export const rooted"',
      dir,
      sha,
      "0001-bootstrap",
      DERIVATION,
    );

    expect(valid).toEqual(
      expect.objectContaining({ kind: "rooted", hunk: "packages/ledger/src/mark.ts" }),
    );
    expect(invalid.kind).toBe("unrooted");
  });

  it("counts CRLF source lines when checking an explicit location", () => {
    const { dir, sha } = repoWithSession();
    const result = checkFoundAt('crlf.ts:2 "second"', dir, sha, "0001-bootstrap", DERIVATION);
    expect(result).toEqual(expect.objectContaining({ kind: "rooted", hunk: "crlf.ts" }));
  });

  it("roots exact final real lines and rejects each adjacent out-of-bounds line", () => {
    const { dir, sha } = repoWithSession();
    const finalLineWithNewline = checkFoundAt(
      'The final declaration is at packages/ledger/src/mark.ts:3, with "export const stale".',
      dir,
      sha,
      "0001-bootstrap",
      DERIVATION,
    );
    const finalLineWithoutNewline = checkFoundAt(
      'The final line in no-final-newline.ts:2; is "last exact".',
      dir,
      sha,
      "0001-bootstrap",
      DERIVATION,
    );
    const beyondNewlineTerminatedFile = checkFoundAt(
      'packages/ledger/src/mark.ts:4 "export const stale"',
      dir,
      sha,
      "0001-bootstrap",
      DERIVATION,
    );
    const beyondNonTerminatedFile = checkFoundAt(
      'no-final-newline.ts:3 "last exact"',
      dir,
      sha,
      "0001-bootstrap",
      DERIVATION,
    );

    expect(finalLineWithNewline).toEqual(
      expect.objectContaining({ kind: "rooted", hunk: "packages/ledger/src/mark.ts" }),
    );
    expect(finalLineWithoutNewline).toEqual(
      expect.objectContaining({ kind: "rooted", hunk: "no-final-newline.ts" }),
    );
    expect(beyondNewlineTerminatedFile.kind).toBe("unrooted");
    expect(beyondNonTerminatedFile.kind).toBe("unrooted");
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
      'packages/ledger/src/mark.ts:1.5 "rooted"',
      'packages/ledger/src/mark.ts:1..2 "rooted"',
      'packages/ledger/src/mark.ts:1,2 "rooted"',
      'missing.ts:1 "rooted"',
    ];
    for (const foundAt of locations) {
      expect(checkFoundAt(foundAt, dir, sha, "0001-bootstrap", DERIVATION).kind).toBe("unrooted");
    }
  });

  it("checks bare explicit locations before they can fall back to out-of-band citations", () => {
    const { dir, sha } = repoWithSession();
    const rootedText = checkFoundAt(
      'evidence.txt:2 "other.ts:2"',
      dir,
      sha,
      "0001-bootstrap",
      DERIVATION,
    );
    const rootedRawBasename = checkFoundAt(
      'Makefile:2 "@echo ready"',
      dir,
      sha,
      "0001-bootstrap",
      DERIVATION,
    );
    const rootedBacktickBasename = checkFoundAt(
      '`Makefile:2` "@echo ready"',
      dir,
      sha,
      "0001-bootstrap",
      DERIVATION,
    );
    const explicitFailures = [
      'evidence.txt:two "other.ts:2"',
      'evidence.txt:3-2 "other.ts:2"',
      'missing.txt:2 "other.ts:2"',
      "evidence.txt:2",
      'evidence.txt:2 "wrong excerpt"',
      'Makefile:two "@echo ready"',
      'Missingfile:2 "@echo ready"',
      "Makefile:2",
      'Makefile:2 "wrong excerpt"',
      '`Makefile:two` "@echo ready"',
      '`Missingfile:2` "@echo ready"',
      "`Makefile:2`",
      '`Makefile:2` "wrong excerpt"',
    ];

    expect(rootedText).toEqual(expect.objectContaining({ kind: "rooted", hunk: "evidence.txt" }));
    expect(rootedRawBasename).toEqual(
      expect.objectContaining({ kind: "rooted", hunk: "Makefile" }),
    );
    expect(rootedBacktickBasename).toEqual(
      expect.objectContaining({ kind: "rooted", hunk: "Makefile" }),
    );
    for (const foundAt of explicitFailures) {
      expect(checkFoundAt(foundAt, dir, sha, "0001-bootstrap", DERIVATION).kind).toBe("unrooted");
    }
  });

  it("does not treat later prose or a quoted extract as another bare location", () => {
    const { dir, sha } = repoWithSession();
    const prose = checkFoundAt(
      'The release is version:2 and the reviewer said "out of band".',
      dir,
      sha,
      "0001-bootstrap",
      DERIVATION,
    );
    const doubleQuotedLocation = checkFoundAt(
      'evidence.txt:2 "other.ts:2"',
      dir,
      sha,
      "0001-bootstrap",
      DERIVATION,
    );
    const backtickQuotedLocation = checkFoundAt(
      "evidence.txt:2 `other.ts:2`",
      dir,
      sha,
      "0001-bootstrap",
      DERIVATION,
    );
    const exactLocatorExtract = checkFoundAt(
      "other.ts:2 `other.ts:2`",
      dir,
      sha,
      "0001-bootstrap",
      DERIVATION,
    );

    expect(prose).toEqual(
      expect.objectContaining({ kind: "rooted", hunk: "out-of-band citation" }),
    );
    expect(doubleQuotedLocation).toEqual(
      expect.objectContaining({ kind: "rooted", hunk: "evidence.txt" }),
    );
    expect(backtickQuotedLocation).toEqual(
      expect.objectContaining({ kind: "rooted", hunk: "evidence.txt" }),
    );
    expect(exactLocatorExtract).toEqual(
      expect.objectContaining({ kind: "rooted", hunk: "other.ts" }),
    );
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

  it("unroots one explicit location with two separate quotations", () => {
    const { dir, sha } = repoWithSession();
    const result = checkFoundAt(
      'packages/ledger/src/mark.ts:1 "rooted" "boundary"',
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

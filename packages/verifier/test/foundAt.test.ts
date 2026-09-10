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
  if (directory !== undefined)
    rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

const DERIVATION = derivation.gate("verifier-hunks", "verifier@0", "test");

function repoWithSession(): { readonly dir: string; readonly sha: string } {
  directory = mkdtempSync(join(runsRoot, "run-"));
  gitInitFixture(directory);
  mkdirSync(join(directory, "packages/ledger/src"), { recursive: true });
  writeFileSync(
    join(directory, "packages/ledger/src/mark.ts"),
    'export const rooted = "rooted";\n',
  );
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

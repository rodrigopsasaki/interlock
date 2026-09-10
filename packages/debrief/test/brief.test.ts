import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isErr, isOk } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import {
  BRIEF_V1,
  explainBriefRefusal,
  explainLegacyBrief,
  readBriefFile,
} from "../src/brief.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined)
    rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function write(content: string): string {
  directory = mkdtempSync(join(runsRoot, "run-"));
  const path = join(directory, "brief.md");
  writeFileSync(path, content);
  return path;
}

const SHA = "d".repeat(40);

const v1FrontMatter = [
  "---",
  `interlock: ${BRIEF_V1}`,
  "graph: g",
  "node: n",
  "role: worker",
  "gates:",
  "  - id: typecheck",
  "    kind: command",
  "    run: pnpm typecheck",
  "scope:",
  "  - packages/x.ts",
  "substrate:",
  "  address: none",
  "---",
  "",
  "# brief",
  "",
].join("\n");

describe("readBriefFile", () => {
  it("refuses a missing file, naming the path", async () => {
    directory = mkdtempSync(join(runsRoot, "run-"));
    const path = join(directory, "brief.md");
    const result = await readBriefFile(path);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.kind).toBe("missing-file");
    expect(explainBriefRefusal(result.error)).toContain(path);
  });

  it("reads a hand-written file with no front matter as legacy", async () => {
    const path = write(
      "# Brief · node `n` · graph `g`\n\nNo front matter here.\n",
    );
    const result = await readBriefFile(path);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    if (result.value.kind !== "legacy")
      throw new Error("expected a legacy brief");
    const legacy = result.value;
    expect(legacy.missingFields).toEqual([
      "graph",
      "node",
      "role",
      "gates",
      "scope",
      "substrate",
    ]);
    expect(explainLegacyBrief(legacy)).toBe(
      `brief@v0, legacy; ${BRIEF_V1} would require: graph, node, role, gates, scope, substrate.`,
    );
  });

  it("reads front matter with no shape tag as legacy, not an error", async () => {
    const path = write(
      ["---", "some_other_tool: v1", "---", "", "# brief", ""].join("\n"),
    );
    const result = await readBriefFile(path);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.kind).toBe("legacy");
  });

  it("refuses a shape tag that names a version this reader does not know", async () => {
    const path = write(
      ["---", "interlock: brief@v9", "graph: g", "---", "", "body", ""].join(
        "\n",
      ),
    );
    const result = await readBriefFile(path);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.kind).toBe("unknown-tag");
    expect(explainBriefRefusal(result.error)).toContain("brief@v9");
    expect(explainBriefRefusal(result.error)).toContain(BRIEF_V1);
  });

  it("refuses front matter that is not valid YAML, naming the file", async () => {
    const path = write(
      ["---", "graph: [unterminated", "---", "", "body", ""].join("\n"),
    );
    const result = await readBriefFile(path);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.kind).toBe("malformed-front-matter");
    expect(explainBriefRefusal(result.error)).toContain(path);
  });

  it("reads a brief@v1 file from the repository, with no runner fields", async () => {
    const path = write(v1FrontMatter);
    const result = await readBriefFile(path);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    if (result.value.kind !== "v1") throw new Error("expected v1");
    expect(result.value.frontMatter.graph).toBe("g");
    expect(result.value.frontMatter.node).toBe("n");
    expect(result.value.frontMatter.role).toBe("worker");
    expect(result.value.frontMatter.gates).toEqual([
      { id: "typecheck", kind: "command", run: "pnpm typecheck" },
    ]);
    expect(result.value.frontMatter.scope).toEqual(["packages/x.ts"]);
    expect(result.value.frontMatter.substrate).toEqual({ address: "none" });
    expect(result.value.frontMatter.runner).toEqual({ kind: "repository" });
    expect(result.value.body).toBe("\n# brief\n");
  });

  it("reads a worktree copy carrying graph_base_sha and session", async () => {
    const withRunnerFields = v1FrontMatter.replace(
      "substrate:\n  address: none\n---",
      `substrate:\n  address: none\ngraph_base_sha: ${SHA}\nsession: s1\n---`,
    );
    const path = write(withRunnerFields);
    const result = await readBriefFile(path);
    expect(isOk(result)).toBe(true);
    if (!isOk(result) || result.value.kind !== "v1")
      throw new Error("expected v1");
    expect(result.value.frontMatter.runner).toEqual({
      kind: "worktree",
      graphBaseSha: SHA,
      session: "s1",
    });
  });

  it("refuses graph_base_sha present without session", async () => {
    const partial = v1FrontMatter.replace(
      "substrate:\n  address: none\n---",
      `substrate:\n  address: none\ngraph_base_sha: ${SHA}\n---`,
    );
    const path = write(partial);
    const result = await readBriefFile(path);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.kind).toBe("invalid-front-matter");
    expect(explainBriefRefusal(result.error)).toContain("session");
  });

  it("refuses a missing required field, naming it", async () => {
    const missingRole = v1FrontMatter.replace("role: worker\n", "");
    const path = write(missingRole);
    const result = await readBriefFile(path);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(explainBriefRefusal(result.error)).toContain('"role"');
  });

  it("refuses a role that is not a plain word", async () => {
    const spacedRole = v1FrontMatter.replace("role: worker", "role: a worker");
    const path = write(spacedRole);
    const result = await readBriefFile(path);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(explainBriefRefusal(result.error)).toContain("not a plain word");
  });

  it("refuses a malformed gate entry, naming its index", async () => {
    const badGate = v1FrontMatter.replace(
      "  - id: typecheck\n    kind: command\n    run: pnpm typecheck\n",
      "  - id: typecheck\n",
    );
    const path = write(badGate);
    const result = await readBriefFile(path);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(explainBriefRefusal(result.error)).toContain("gates");
    expect(explainBriefRefusal(result.error)).toContain('"kind"');
  });

  it("refuses a scope path that is absolute", async () => {
    const path = write(v1FrontMatter.replace("packages/x.ts", "/etc/passwd"));
    const result = await readBriefFile(path);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(explainBriefRefusal(result.error)).toContain("scope[0]");
  });

  it("refuses a scope path that escapes the repository root", async () => {
    const path = write(v1FrontMatter.replace("packages/x.ts", "../outside.ts"));
    const result = await readBriefFile(path);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(explainBriefRefusal(result.error)).toContain("scope[0]");
  });
});

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");

const existingBriefs: readonly [string, string][] = [
  ["0001-bootstrap", "debrief-schema"],
  ["0001-bootstrap", "face-read"],
  ["0001-bootstrap", "ledger-gaps"],
  ["0001-bootstrap", "ledger"],
  ["0001-bootstrap", "runner-command-gate"],
  ["0001-bootstrap", "scaffold"],
  ["0002-shapes", "brief-shape"],
];

describe("every existing brief under .interlock/sessions", () => {
  it.each(existingBriefs)(
    "%s/%s validates as brief@v0",
    async (graph, node) => {
      const path = join(
        REPO_ROOT,
        ".interlock",
        "sessions",
        graph,
        node,
        "brief.md",
      );
      const result = await readBriefFile(path);
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.kind).toBe("legacy");
    },
  );

  // verifier-hunks is the first node `interlock run` itself has leased: the runner rewrites
  // brief.md into a real brief@v1 in the worktree before the session starts, so this one
  // session directory's file is no longer the scaffolded legacy placeholder every other one
  // still is.
  it("0001-bootstrap/verifier-hunks validates as brief@v1, rewritten by the runner", async () => {
    const path = join(
      REPO_ROOT,
      ".interlock",
      "sessions",
      "0001-bootstrap",
      "verifier-hunks",
      "brief.md",
    );
    const result = await readBriefFile(path);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.kind).toBe("v1");
  });
});

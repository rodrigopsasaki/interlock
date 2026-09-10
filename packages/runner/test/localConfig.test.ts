import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isErr, isOk } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import { loadLocalConfig } from "../src/localConfig.ts";

const runsRoot = join(import.meta.dirname, ".localconfig-runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined)
    rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

const baseFields = [
  "interlock: local@v0",
  "runtime:",
  "  kind: claude",
  "  args: []",
  "worktree_root: .worktrees",
  "lease_ms: 900000",
  "run_timeout_ms: 3600000",
  "substrate:",
  "  address: none",
  "",
];

function fixtureRepo(localYaml: string): string {
  directory = mkdtempSync(join(runsRoot, "localconfig-"));
  mkdirSync(join(directory, ".interlock"), { recursive: true });
  writeFileSync(join(directory, ".interlock", "local.yaml"), localYaml);
  return directory;
}

describe("loadLocalConfig runtime.startup_answers", () => {
  it("defaults to an empty list when the field is absent", async () => {
    const repoRoot = fixtureRepo(baseFields.join("\n"));

    const result = await loadLocalConfig(repoRoot);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value.runtime.startupAnswers).toEqual([]);
  });

  it("parses a mix of substring and regex matchers, in declared order", async () => {
    const yaml = [
      "interlock: local@v0",
      "runtime:",
      "  kind: claude",
      "  args: []",
      "  startup_answers:",
      '    - matches: "trust this project"',
      "      keys:",
      "        - Down",
      "        - Enter",
      '    - matches: "/allow.*access/i"',
      "      keys:",
      "        - y",
      "worktree_root: .worktrees",
      "lease_ms: 900000",
      "run_timeout_ms: 3600000",
      "substrate:",
      "  address: none",
      "",
    ].join("\n");
    const repoRoot = fixtureRepo(yaml);

    const result = await loadLocalConfig(repoRoot);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.runtime.startupAnswers).toEqual([
        { matches: "trust this project", keys: ["Down", "Enter"] },
        { matches: "/allow.*access/i", keys: ["y"] },
      ]);
    }
  });

  it("refuses with a sentence error naming the entry when startup_answers is not a list", async () => {
    const yaml = [
      "interlock: local@v0",
      "runtime:",
      "  kind: claude",
      "  args: []",
      "  startup_answers: not-a-list",
      "worktree_root: .worktrees",
      "lease_ms: 900000",
      "run_timeout_ms: 3600000",
      "substrate:",
      "  address: none",
      "",
    ].join("\n");
    const repoRoot = fixtureRepo(yaml);

    const result = await loadLocalConfig(repoRoot);

    expect(isErr(result)).toBe(true);
    if (isErr(result) && result.error.kind === "malformed") {
      expect(result.error.reason).toContain('"runtime.startup_answers"');
    }
  });

  it("refuses with a sentence error naming the entry when an entry has no keys", async () => {
    const yaml = [
      "interlock: local@v0",
      "runtime:",
      "  kind: claude",
      "  args: []",
      "  startup_answers:",
      '    - matches: "trust this project"',
      "worktree_root: .worktrees",
      "lease_ms: 900000",
      "run_timeout_ms: 3600000",
      "substrate:",
      "  address: none",
      "",
    ].join("\n");
    const repoRoot = fixtureRepo(yaml);

    const result = await loadLocalConfig(repoRoot);

    expect(isErr(result)).toBe(true);
    if (isErr(result) && result.error.kind === "malformed") {
      expect(result.error.reason).toContain(
        '"runtime.startup_answers[0].keys"',
      );
    }
  });

  it("refuses with a sentence error naming the entry when a matcher's regex literal is invalid", async () => {
    const yaml = [
      "interlock: local@v0",
      "runtime:",
      "  kind: claude",
      "  args: []",
      "  startup_answers:",
      '    - matches: "/unterminated[/"',
      "      keys:",
      "        - Enter",
      "worktree_root: .worktrees",
      "lease_ms: 900000",
      "run_timeout_ms: 3600000",
      "substrate:",
      "  address: none",
      "",
    ].join("\n");
    const repoRoot = fixtureRepo(yaml);

    const result = await loadLocalConfig(repoRoot);

    expect(isErr(result)).toBe(true);
    if (isErr(result) && result.error.kind === "malformed") {
      expect(result.error.reason).toContain(
        '"runtime.startup_answers[0].matches"',
      );
    }
  });
});

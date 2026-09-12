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

describe("loadLocalConfig runtime.startup_timeout_ms", () => {
  it("defaults to 60000 when the field is absent", async () => {
    const repoRoot = fixtureRepo(baseFields.join("\n"));

    const result = await loadLocalConfig(repoRoot);

    expect(isOk(result)).toBe(true);
    if (isOk(result))
      expect(result.value.runtime.startupTimeoutMs).toBe(60_000);
  });

  it("parses an explicit value", async () => {
    const yaml = [
      "interlock: local@v0",
      "runtime:",
      "  kind: claude",
      "  args: []",
      "  startup_timeout_ms: 15000",
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
    if (isOk(result))
      expect(result.value.runtime.startupTimeoutMs).toBe(15_000);
  });

  it("refuses with a sentence error naming the field when it is not a number", async () => {
    const yaml = [
      "interlock: local@v0",
      "runtime:",
      "  kind: claude",
      "  args: []",
      "  startup_timeout_ms: soon",
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
      expect(result.error.reason).toContain('"runtime.startup_timeout_ms"');
    }
  });
});

describe("loadLocalConfig runtime.prompt_taken_timeout_ms", () => {
  it("defaults to 20000 when the field is absent", async () => {
    const repoRoot = fixtureRepo(baseFields.join("\n"));

    const result = await loadLocalConfig(repoRoot);

    expect(isOk(result)).toBe(true);
    if (isOk(result))
      expect(result.value.runtime.promptTakenTimeoutMs).toBe(20_000);
  });

  it("parses an explicit value", async () => {
    const yaml = [
      "interlock: local@v0",
      "runtime:",
      "  kind: claude",
      "  args: []",
      "  prompt_taken_timeout_ms: 5000",
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
    if (isOk(result))
      expect(result.value.runtime.promptTakenTimeoutMs).toBe(5_000);
  });

  it("refuses with a sentence error naming the field when it is not a number", async () => {
    const yaml = [
      "interlock: local@v0",
      "runtime:",
      "  kind: claude",
      "  args: []",
      "  prompt_taken_timeout_ms: soon",
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
        '"runtime.prompt_taken_timeout_ms"',
      );
    }
  });
});

describe("loadLocalConfig answer_grace_ms", () => {
  it("defaults to 300000 when the field is absent", async () => {
    const repoRoot = fixtureRepo(baseFields.join("\n"));

    const result = await loadLocalConfig(repoRoot);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value.answerGraceMs).toBe(300_000);
  });

  it("refuses with a sentence error naming the field when it is not a number", async () => {
    const yaml = [
      "interlock: local@v0",
      "runtime:",
      "  kind: claude",
      "  args: []",
      "worktree_root: .worktrees",
      "lease_ms: 900000",
      "run_timeout_ms: 3600000",
      "answer_grace_ms: soon",
      "substrate:",
      "  address: none",
      "",
    ].join("\n");
    const repoRoot = fixtureRepo(yaml);

    const result = await loadLocalConfig(repoRoot);

    expect(isErr(result)).toBe(true);
    if (isErr(result) && result.error.kind === "malformed") {
      expect(result.error.reason).toContain('"answer_grace_ms"');
    }
  });
});

describe("loadLocalConfig worktree_setup", () => {
  it("defaults to an empty list when the field is absent", async () => {
    const repoRoot = fixtureRepo(baseFields.join("\n"));

    const result = await loadLocalConfig(repoRoot);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value.worktreeSetup).toEqual([]);
  });

  it("parses a list of commands in declared order", async () => {
    const yaml = [
      "interlock: local@v0",
      "runtime:",
      "  kind: claude",
      "  args: []",
      "worktree_root: .worktrees",
      "worktree_setup:",
      '  - "install dependencies"',
      '  - "build the toolchain cache"',
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
      expect(result.value.worktreeSetup).toEqual([
        "install dependencies",
        "build the toolchain cache",
      ]);
    }
  });

  it("refuses with a sentence error naming the field when it is not a list of strings", async () => {
    const yaml = [
      "interlock: local@v0",
      "runtime:",
      "  kind: claude",
      "  args: []",
      "worktree_root: .worktrees",
      "worktree_setup: not-a-list",
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
      expect(result.error.reason).toContain('"worktree_setup"');
    }
  });
});

describe("loadLocalConfig substrate", () => {
  it("accepts an http(s) address and an optional key_file", async () => {
    const yaml = [
      "interlock: local@v0",
      "runtime:",
      "  kind: claude",
      "  args: []",
      "worktree_root: .worktrees",
      "lease_ms: 900000",
      "run_timeout_ms: 3600000",
      "substrate:",
      "  address: https://substrate.example.com",
      "  key_file: /path/to/key",
      "",
    ].join("\n");
    const repoRoot = fixtureRepo(yaml);

    const result = await loadLocalConfig(repoRoot);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.substrateAddress).toBe(
        "https://substrate.example.com",
      );
      expect(result.value.substrateKeyFile).toBe("/path/to/key");
    }
  });

  it("refuses an address that is neither none nor an http(s) URL", async () => {
    const yaml = [
      "interlock: local@v0",
      "runtime:",
      "  kind: claude",
      "  args: []",
      "worktree_root: .worktrees",
      "lease_ms: 900000",
      "run_timeout_ms: 3600000",
      "substrate:",
      "  address: some-substrate",
      "",
    ].join("\n");
    const repoRoot = fixtureRepo(yaml);

    const result = await loadLocalConfig(repoRoot);

    expect(isErr(result)).toBe(true);
    if (isErr(result) && result.error.kind === "malformed") {
      expect(result.error.reason).toContain('"substrate.address"');
    }
  });

  it("leaves substrateKeyFile absent when key_file is not set", async () => {
    const repoRoot = fixtureRepo(baseFields.join("\n"));

    const result = await loadLocalConfig(repoRoot);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value.substrateKeyFile).toBeUndefined();
  });
});

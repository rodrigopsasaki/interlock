import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ok } from "@phyxiusjs/fp";
import { describe, expect, it } from "vitest";
import { runRuntimeProbe } from "../src/runtime/probe.ts";
import { commitAll, gitInitFixture } from "./graph/gitFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

interface ProviderRecord {
  readonly operation: string;
  readonly values: readonly string[];
}

function providerRecord(value: unknown): ProviderRecord | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    !("operation" in value) ||
    !("values" in value)
  ) {
    return undefined;
  }
  return typeof value.operation === "string" &&
    Array.isArray(value.values) &&
    value.values.every((item) => typeof item === "string")
    ? { operation: value.operation, values: value.values }
    : undefined;
}

describe("exec runtime probes", () => {
  it("runs shipped checks through a headless program and preserves unavailable failures", async () => {
    const directory = mkdtempSync(join(runsRoot, "exec-probe-"));
    const previousRuntimes = process.env["INTERLOCK_RUNTIMES"];
    const previousAuthor = process.env["GIT_AUTHOR_NAME"];
    const previousAuthorEmail = process.env["GIT_AUTHOR_EMAIL"];
    const previousCommitter = process.env["GIT_COMMITTER_NAME"];
    const previousCommitterEmail = process.env["GIT_COMMITTER_EMAIL"];
    try {
      mkdirSync(join(directory, ".interlock"), { recursive: true });
      const agent = join(directory, "fixture-agent.mjs");
      writeFileSync(
        agent,
        [
          'import { spawnSync } from "node:child_process";',
          'const command = process.argv.find((argument) => argument.startsWith("interlock-probe-"));',
          "if (command === undefined) process.exit(2);",
          'const result = spawnSync(command, [], { cwd: process.cwd(), env: process.env, encoding: "utf8" });',
          'process.stdout.write(result.stdout ?? "");',
          'process.stderr.write(result.stderr ?? "");',
          "process.exit(result.status ?? 1);",
          "",
        ].join("\n"),
      );
      const runtimes = join(directory, "runtimes.yaml");
      writeFileSync(
        runtimes,
        [
          "interlock: runtimes@v2",
          "runtimes:",
          "  fixture:",
          "    kind: exec",
          "    commits: runner",
          `    args: [${JSON.stringify(process.execPath)}, ${JSON.stringify(agent)}]`,
          '    headless_args: [--headless, "{prompt}"]',
          `    exec: [${JSON.stringify(process.execPath)}, ${JSON.stringify(agent)}, --headless, "{command}", --forward, INTERLOCK_PROBE_DENY_SHM]`,
          "    model: fixture",
          "    environment_passthrough: [INTERLOCK_PROBE_DENY_SHM]",
          '    environment_forward_args: ["--forward", "{name}"]',
          "",
        ].join("\n"),
      );
      gitInitFixture(directory);
      commitAll(directory, "fixture probe");
      process.env["INTERLOCK_RUNTIMES"] = runtimes;
      process.env["GIT_AUTHOR_NAME"] = "fixture";
      process.env["GIT_AUTHOR_EMAIL"] = "fixture@example.invalid";
      process.env["GIT_COMMITTER_NAME"] = "fixture";
      process.env["GIT_COMMITTER_EMAIL"] = "fixture@example.invalid";
      const result = await runRuntimeProbe(["fixture", "--json"], {
        cwd: directory,
        machine: {
          provider: "none",
          env: { INTERLOCK_PROBE_DENY_SHM: "1" },
          heavy: [],
        },
        runnerSignedCommit: async () => ok("fixture-fingerprint"),
      });

      expect(result.exitCode).toBe(1);
      const parsed: unknown = JSON.parse(result.message);
      expect(parsed).toMatchObject({
        profile: "fixture",
        checks: [
          { check: "shm", state: "refused" },
          { check: "loopback", state: "passed" },
          { check: "worktree-file", state: "passed" },
          { check: "git-metadata", state: "passed" },
          { check: "signed-commit", state: "passed", fingerprint: "fixture-fingerprint" },
        ],
      });
      expect(readFileSync(join(directory, ".git", "HEAD"), "utf8")).toContain("refs/heads/main");
    } finally {
      rmSync(directory, { recursive: true, force: true });
      if (previousRuntimes === undefined) delete process.env["INTERLOCK_RUNTIMES"];
      else process.env["INTERLOCK_RUNTIMES"] = previousRuntimes;
      if (previousAuthor === undefined) delete process.env["GIT_AUTHOR_NAME"];
      else process.env["GIT_AUTHOR_NAME"] = previousAuthor;
      if (previousAuthorEmail === undefined) delete process.env["GIT_AUTHOR_EMAIL"];
      else process.env["GIT_AUTHOR_EMAIL"] = previousAuthorEmail;
      if (previousCommitter === undefined) delete process.env["GIT_COMMITTER_NAME"];
      else process.env["GIT_COMMITTER_NAME"] = previousCommitter;
      if (previousCommitterEmail === undefined) delete process.env["GIT_COMMITTER_EMAIL"];
      else process.env["GIT_COMMITTER_EMAIL"] = previousCommitterEmail;
    }
  });

  it("binds and releases each real probe process with its identity", async () => {
    const directory = mkdtempSync(join(runsRoot, "exec-probe-provider-"));
    const previousRuntimes = process.env["INTERLOCK_RUNTIMES"];
    const previousAuthor = process.env["GIT_AUTHOR_NAME"];
    const previousAuthorEmail = process.env["GIT_AUTHOR_EMAIL"];
    const previousCommitter = process.env["GIT_COMMITTER_NAME"];
    const previousCommitterEmail = process.env["GIT_COMMITTER_EMAIL"];
    try {
      mkdirSync(join(directory, ".interlock"), { recursive: true });
      const agent = join(directory, "fixture-agent.mjs");
      const provider = join(directory, "fixture-provider.mjs");
      const log = join(directory, "provider.jsonl");
      writeFileSync(
        agent,
        [
          'import { spawnSync } from "node:child_process";',
          'const command = process.argv.find((argument) => argument.startsWith("interlock-probe-"));',
          "if (command === undefined) process.exit(2);",
          'const result = spawnSync(command, [], { cwd: process.cwd(), env: process.env, encoding: "utf8" });',
          'process.stdout.write(result.stdout ?? "");',
          'process.stderr.write(result.stderr ?? "");',
          "process.exit(result.status ?? 1);",
          "",
        ].join("\n"),
      );
      writeFileSync(
        provider,
        [
          'import { appendFileSync } from "node:fs";',
          'appendFileSync(process.env.PROBE_PROVIDER_LOG, JSON.stringify({ operation: process.argv[2], values: process.argv.slice(3) }) + "\\n");',
          "",
        ].join("\n"),
      );
      const runtimes = join(directory, "runtimes.yaml");
      writeFileSync(
        runtimes,
        [
          "interlock: runtimes@v2",
          "runtimes:",
          "  fixture:",
          "    kind: exec",
          "    commits: runner",
          `    args: [${JSON.stringify(process.execPath)}, ${JSON.stringify(agent)}]`,
          '    headless_args: [--headless, "{prompt}"]',
          `    exec: [${JSON.stringify(process.execPath)}, ${JSON.stringify(agent)}, --headless, "{command}"]`,
          "    model: fixture",
          "",
        ].join("\n"),
      );
      gitInitFixture(directory);
      commitAll(directory, "fixture probe provider");
      process.env["INTERLOCK_RUNTIMES"] = runtimes;
      process.env["GIT_AUTHOR_NAME"] = "fixture";
      process.env["GIT_AUTHOR_EMAIL"] = "fixture@example.invalid";
      process.env["GIT_COMMITTER_NAME"] = "fixture";
      process.env["GIT_COMMITTER_EMAIL"] = "fixture@example.invalid";
      const result = await runRuntimeProbe(["fixture", "--json"], {
        cwd: directory,
        machine: {
          provider: {
            admit: [process.execPath, provider, "admit"],
            bind: [process.execPath, provider, "bind", "{pid}", "{pgid}", "{birth}", "{boot}"],
            release: [
              process.execPath,
              provider,
              "release",
              "{pid}",
              "{pgid}",
              "{birth}",
              "{boot}",
              "{outcome}",
            ],
            env: [process.execPath, provider, "env"],
            heavy: [],
          },
          env: { PROBE_PROVIDER_LOG: log, INTERLOCK_PROBE_DENY_SHM: "1" },
          heavy: [],
        },
        runnerSignedCommit: async () => ok("fixture-fingerprint"),
      });

      expect(result.exitCode).toBe(1);
      const records = readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => {
          const record = providerRecord(JSON.parse(line));
          if (record === undefined) throw new Error("provider fixture wrote an invalid record");
          return record;
        });
      expect(records.filter((record) => record.operation === "admit")).toHaveLength(4);
      const binds = records.filter((record) => record.operation === "bind");
      const releases = records.filter((record) => record.operation === "release");
      expect(binds).toHaveLength(4);
      expect(releases).toHaveLength(4);
      expect(binds.every((record) => /^\d+$/.test(record.values[0] ?? ""))).toBe(true);
      expect(binds.every((record) => record.values[0] === record.values[1])).toBe(true);
      expect(releases.every((record) => record.values[0] === record.values[1])).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
      if (previousRuntimes === undefined) delete process.env["INTERLOCK_RUNTIMES"];
      else process.env["INTERLOCK_RUNTIMES"] = previousRuntimes;
      if (previousAuthor === undefined) delete process.env["GIT_AUTHOR_NAME"];
      else process.env["GIT_AUTHOR_NAME"] = previousAuthor;
      if (previousAuthorEmail === undefined) delete process.env["GIT_AUTHOR_EMAIL"];
      else process.env["GIT_AUTHOR_EMAIL"] = previousAuthorEmail;
      if (previousCommitter === undefined) delete process.env["GIT_COMMITTER_NAME"];
      else process.env["GIT_COMMITTER_NAME"] = previousCommitter;
      if (previousCommitterEmail === undefined) delete process.env["GIT_COMMITTER_EMAIL"];
      else process.env["GIT_COMMITTER_EMAIL"] = previousCommitterEmail;
    }
  });
});

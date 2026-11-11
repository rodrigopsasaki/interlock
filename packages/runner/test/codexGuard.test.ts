import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupCodexLaunches,
  type ProcessRecord,
  type ProcessTable,
  registerLaunch,
} from "./support/codexSupervisor.ts";

const runsRoot = join(import.meta.dirname, ".runs");
const guardDirectory = process.env["INTERLOCK_CODEX_GUARD_DIR"];
const pathAfterGuard = (process.env["PATH"] ?? "")
  .split(delimiter)
  .filter((entry) => entry !== guardDirectory)
  .join(delimiter);
let directories: string[] = [];

afterEach(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
  directories = [];
});

function fixture(): {
  readonly root: string;
  readonly home: string;
  readonly bin: string;
  readonly count: string;
} {
  const root = mkdtempSync(join(runsRoot, "codex-guard-case-"));
  const home = join(root, "codex-home");
  const bin = join(root, "bin");
  const count = join(root, "starts");
  mkdirSync(home);
  mkdirSync(bin);
  writeFileSync(count, "0");
  directories.push(root);
  return { root, home, bin, count };
}

function fakeCodex(bin: string, count: string, extra = ""): string {
  const executable = join(bin, "codex");
  writeFileSync(
    executable,
    `#!/usr/bin/env node
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
const countPath = process.env["FAKE_CODEX_COUNT"];
if (countPath !== undefined) {
  const count = Number(readFileSync(countPath, "utf8"));
  writeFileSync(countPath, String(count + 1));
}
${extra}
if (process.argv[2] === "mcp") process.stdout.write("[]\\n");
`,
    { mode: 0o700 },
  );
  if (guardDirectory === undefined) throw new Error("the Codex guard was not installed");
  process.env["PATH"] = [guardDirectory, bin, pathAfterGuard].join(delimiter);
  process.env["FAKE_CODEX_COUNT"] = count;
  return executable;
}

function run(
  args: readonly string[],
  environment: Readonly<Record<string, string>>,
): { readonly error: string; readonly count: string } {
  try {
    execFileSync("codex", args, { env: { ...process.env, ...environment }, encoding: "utf8" });
    return { error: "", count: readFileSync(environment["FAKE_CODEX_COUNT"] ?? "", "utf8") };
  } catch (error) {
    const failure = isRecord(error) ? error : {};
    const stderr = typeof failure["stderr"] === "string" ? failure["stderr"] : "";
    const stdout = typeof failure["stdout"] === "string" ? failure["stdout"] : "";
    return {
      error: `${stderr}${stdout}`,
      count: readFileSync(environment["FAKE_CODEX_COUNT"] ?? "", "utf8"),
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function environment(home: string, count: string): Record<string, string> {
  return {
    HOME: join(home, "home"),
    CODEX_HOME: home,
    FAKE_CODEX_COUNT: count,
  };
}

function config(home: string, text: string): void {
  writeFileSync(join(home, "config.toml"), text);
}

describe("Codex test guard", () => {
  it.each(["app-server", "login", "logout", "unknown-form"])(
    "refuses %s before the fake starts",
    (form) => {
      const { home, bin, count } = fixture();
      fakeCodex(bin, count);
      const values = environment(home, count);
      const result = run([form], values);
      expect(result.error).toContain(form);
      expect(result.count).toBe("0");
    },
  );

  it.each([
    ["default provider", "", "exec"],
    [
      "non-loopback provider",
      'model_provider = "remote"\n[model_providers.remote]\nbase_url = "https://api.example.com/v1"',
      "exec",
    ],
    [
      "malformed base_url",
      'model_provider = "broken"\n[model_providers.broken]\nbase_url = "not a url"',
      "exec",
    ],
  ])("refuses %s", (_name, text, command) => {
    const { home, bin, count } = fixture();
    fakeCodex(bin, count);
    config(home, text);
    const result = run([command, "proof"], environment(home, count));
    expect(result.error).toContain("codex exec refused");
    expect(result.count).toBe("0");
  });

  it("refuses a missing selected profile", () => {
    const { home, bin, count } = fixture();
    fakeCodex(bin, count);
    config(home, 'profile = "missing"');
    const result = run(["--profile", "missing", "exec", "proof"], environment(home, count));
    expect(result.error).toContain("missing.config.toml");
    expect(result.count).toBe("0");
  });

  it.each(["model_provider=remote", 'model_providers.remote.base_url="http://127.0.0.1"'])(
    "refuses a provider selector: %s",
    (selector) => {
      const { home, bin, count } = fixture();
      fakeCodex(bin, count);
      config(
        home,
        'model_provider = "local"\n[model_providers.local]\nbase_url = "http://127.0.0.1"',
      );
      const result = run(["-c", selector, "exec", "proof"], environment(home, count));
      expect(result.error).toContain("selector touches provider configuration");
      expect(result.count).toBe("0");
    },
  );

  it.each(["127.0.0.1", "::1", "localhost"])("allows loopback provider %s", (host) => {
    const { home, bin, count } = fixture();
    fakeCodex(bin, count);
    const baseUrl = host === "::1" ? "http://[::1]:1234/v1" : `http://${host}:1234/v1`;
    config(home, `model_provider = "local"\n[model_providers.local]\nbase_url = "${baseUrl}"`);
    const result = run(["exec", "proof"], environment(home, count));
    expect(result.error).toBe("");
    expect(result.count).toBe("1");
  });

  it("uses a profile overlay and parses global flags before the subcommand", () => {
    const { home, bin, count } = fixture();
    fakeCodex(bin, count);
    config(
      home,
      'model_provider = "remote"\n[model_providers.remote]\nbase_url = "https://api.example.com/v1"',
    );
    writeFileSync(
      join(home, "fast.config.toml"),
      'model_provider = "local"\n[model_providers.local]\nbase_url = "http://localhost:1234/v1"',
    );
    const result = run(
      ["--profile", "fast", "-c", 'shell_environment_policy.set.TEST="yes"', "exec", "proof"],
      environment(home, count),
    );
    expect(result.error).toBe("");
    expect(result.count).toBe("1");
  });

  it("allows both mcp list forms", () => {
    const { home, bin, count } = fixture();
    fakeCodex(bin, count);
    const values = environment(home, count);
    run(["mcp", "list"], values);
    run(["mcp", "list", "--json"], values);
    expect(readFileSync(count, "utf8")).toBe("2");
  });

  it("fails a nested fixture when a detached descendant carries the launch token", () => {
    const { root, home, bin, count } = fixture();
    const tokenPath = join(root, "token");
    const pidPath = join(root, "pid");
    fakeCodex(
      bin,
      count,
      `import { spawn } from "node:child_process";
const child = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); process.on('SIGHUP', () => {}); setInterval(() => {}, 1000)"], { detached: true, stdio: "ignore", env: process.env });
if (child.pid !== undefined) writeFileSync(${JSON.stringify(pidPath)}, String(child.pid));
child.unref();
writeFileSync(${JSON.stringify(tokenPath)}, process.env["INTERLOCK_CODEX_LAUNCH_TOKEN"] ?? "");
`,
    );
    config(
      home,
      'model_provider = "local"\n[model_providers.local]\nbase_url = "http://127.0.0.1:1234/v1"',
    );
    const fixtureFile = join(import.meta.dirname, "fixtures", "codexGuardLeak.test.ts");
    const vitest = join(import.meta.dirname, "..", "node_modules", "vitest", "vitest.mjs");
    const result = spawnSync(
      process.execPath,
      [vitest, "run", fixtureFile, "--config", join(import.meta.dirname, "..", "vitest.config.ts")],
      {
        cwd: join(import.meta.dirname, ".."),
        env: {
          ...process.env,
          HOME: join(root, "home"),
          CODEX_HOME: home,
          FAKE_CODEX_COUNT: count,
          PATH: [guardDirectory, bin, pathAfterGuard]
            .filter((value): value is string => value !== undefined)
            .join(delimiter),
          INTERLOCK_CODEX_FIXTURE: "1",
          INTERLOCK_GUARD_TOKEN_FILE: tokenPath,
        },
        encoding: "utf8",
      },
    );
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    expect(result.status).not.toBe(0);
    expect(output).toContain("Codex launch survivors:");
    const pid = readFileSync(pidPath, "utf8");
    expect(output).toContain(pid);
    const token = readFileSync(tokenPath, "utf8");
    expect(token.length).toBeGreaterThan(0);
    expect(processTableWithToken(token).some((entry) => entry.state === "running")).toBe(false);
  });

  it("does not signal a reused pid", async () => {
    const { root } = fixture();
    const registry = join(root, "registry.jsonl");
    registerLaunch(registry, 42, 42, "old-start", "token");
    const record: ProcessRecord = {
      pid: 42,
      ppid: 1,
      pgid: 42,
      startTime: "new-start",
      command: "reused",
      environment: { INTERLOCK_CODEX_LAUNCH_TOKEN: "token" },
      state: "running",
    };
    const calls: string[] = [];
    const table: ProcessTable = { list: () => [record] };
    await cleanupCodexLaunches(
      registry,
      table,
      (pid, signal) => calls.push(`${String(pid)}:${signal}`),
      0,
    );
    expect(calls).toEqual([]);
  });
});

function processTableWithToken(token: string): readonly ProcessRecord[] {
  const output = spawnSync("ps", ["eww", "-axo", "pid=,ppid=,pgid=,command="], {
    encoding: "utf8",
  });
  if (output.status !== 0) return [];
  return output.stdout
    .split(/\r?\n/)
    .filter((line) => line.includes(`INTERLOCK_CODEX_LAUNCH_TOKEN=${token}`))
    .map((line) => ({
      pid: Number(line.trim().split(/\s+/)[0]),
      ppid: 0,
      pgid: 0,
      startTime: "",
      command: line,
      environment: { INTERLOCK_CODEX_LAUNCH_TOKEN: token },
      state: "running",
    }));
}

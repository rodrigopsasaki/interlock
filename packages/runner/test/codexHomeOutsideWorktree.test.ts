import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { isErr, isOk, ok } from "@phyxiusjs/fp";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { fixtureGit, initFixtureRepository } from "../../../test/support/gitFixture.ts";
import { interlockStateDirectory, prepareCodexLaunch } from "../src/codex/config.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });
let directories: string[] = [];
const previousGitCeiling = process.env["GIT_CEILING_DIRECTORIES"];

beforeAll(() => {
  process.env["GIT_CEILING_DIRECTORIES"] = join(runsRoot, "..");
});

afterAll(() => {
  if (previousGitCeiling === undefined) delete process.env["GIT_CEILING_DIRECTORIES"];
  else process.env["GIT_CEILING_DIRECTORIES"] = previousGitCeiling;
});

afterEach(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
  directories = [];
});

function fixture(): { readonly repository: string; readonly state: string; readonly home: string } {
  const repository = mkdtempSync(join(runsRoot, "overlay-repository-"));
  const state = mkdtempSync(join(runsRoot, "overlay-state-"));
  const home = mkdtempSync(join(runsRoot, "overlay-home-"));
  directories = [repository, state, home];
  initFixtureRepository(repository);
  writeFileSync(join(home, "config.toml"), "");
  writeFileSync(join(home, "auth.json"), '{"token":"fixture"}\n');
  return { repository, state, home };
}

function configuredNames(): readonly string[] {
  return Array.from({ length: 12 }, (_, index) => `server_${String(index)}_${"x".repeat(48)}`);
}

function overflowConfig(command = "fixture"): string {
  return configuredNames()
    .map((name) => `[mcp_servers.${name}]\ncommand = ${JSON.stringify(command)}\n`)
    .join("\n");
}

function environment(
  _repository: string,
  state: string,
  home: string,
  session = "fixture-session",
): Readonly<Record<string, string>> {
  return {
    HOME: join(state, "home"),
    XDG_STATE_HOME: state,
    CODEX_HOME: home,
    INTERLOCK_GRAPH: "0060-headless-runtime",
    INTERLOCK_NODE: "codex-home-outside-worktree",
    INTERLOCK_SESSION: session,
  };
}

function writeOwnerJournal(
  path: string,
  graph: string,
  node: string,
  session: string,
  outcomeKind?: "cleared" | "failed" | "held" | "cancelled",
  anotherSession?: string,
): void {
  const events = [
    JSON.stringify({
      interlock: "event@v9",
      kind: "session-started",
      session: { id: session, node: { graph, id: node } },
    }),
    JSON.stringify({
      interlock: "event@v9",
      kind: "lease-taken",
      session,
      expiry: 1,
    }),
  ];
  if (anotherSession !== undefined) {
    events.push(
      JSON.stringify({
        interlock: "event@v9",
        kind: "session-started",
        session: { id: anotherSession, node: { graph, id: node } },
      }),
    );
  }
  if (outcomeKind !== undefined) {
    events.push(
      JSON.stringify({
        interlock: "event@v9",
        kind: "outcome-set",
        node: { graph, id: node },
        outcome: outcomeKind === "cleared" ? { kind: outcomeKind, receipts: [] } : { kind: outcomeKind },
      }),
    );
  }
  writeFileSync(path, events.join("\n"));
}

function writeOwnedOverlay(state: string, journal: string, session: string): string {
  const overlay = join(
    state,
    "interlock",
    "codex-homes",
    "0060-headless-runtime",
    "codex-home-outside-worktree",
    session,
  );
  mkdirSync(overlay, { recursive: true });
  writeFileSync(
    join(overlay, "owner.json"),
    `${JSON.stringify({
      interlock: "codex-overlay-owner@v0",
      journal,
      graph: "0060-headless-runtime",
      node: "codex-home-outside-worktree",
      session,
      terminationConfirmed: true,
    })}\n`,
  );
  return overlay;
}

describe("Codex home outside worktree", () => {
  it("places an overflow home in isolated machine state and cleans only the overlay", () => {
    const { repository, state, home } = fixture();
    writeFileSync(join(home, "config.toml"), overflowConfig());
    const launch = prepareCodexLaunch([], repository, environment(repository, state, home), {
      listCodexMcp: () => ok(configuredNames()),
    });
    expect(isOk(launch)).toBe(true);
    if (!isOk(launch)) return;
    const overlay = launch.value.environment["CODEX_HOME"];
    expect(overlay?.startsWith(join(state, "interlock", "codex-homes"))).toBe(true);
    if (overlay === undefined) return;
    expect(readFileSync(join(overlay, "auth.json"), "utf8")).toBe('{"token":"fixture"}\n');
    expect(fixtureGit(["status", "--porcelain", "--ignored"], { cwd: repository })).toBe("");
    launch.value.cleanup(true);
    expect(() => readFileSync(join(overlay, "owner.json"), "utf8")).toThrow();
    expect(readFileSync(join(home, "auth.json"), "utf8")).toBe('{"token":"fixture"}\n');
  });

  it("refuses state physically inside the launch repository, including a symlink alias", () => {
    const { repository, state, home } = fixture();
    writeFileSync(join(home, "config.toml"), overflowConfig());
    const inside = join(repository, "state");
    mkdirSync(inside);
    const direct = prepareCodexLaunch([], repository, {
      ...environment(repository, state, home),
      XDG_STATE_HOME: inside,
    });
    expect(isErr(direct)).toBe(true);
    const alias = join(repository, "state-alias");
    symlinkSync(inside, alias, "dir");
    const linked = prepareCodexLaunch([], repository, {
      ...environment(repository, state, home, "session-2"),
      XDG_STATE_HOME: alias,
    });
    expect(isErr(linked)).toBe(true);
  });

  it("uses the HOME state fallback when XDG_STATE_HOME is empty or absent", () => {
    const home = join(runsRoot, "fallback-home");
    expect(interlockStateDirectory({ HOME: home })).toBe(join(home, ".local", "state", "interlock"));
    expect(interlockStateDirectory({ HOME: home, XDG_STATE_HOME: "" })).toBe(
      join(home, ".local", "state", "interlock"),
    );
  });

  it("removes a prior overlay only when its owner journal confirms termination", () => {
    const { repository, state, home } = fixture();
    writeFileSync(join(home, "config.toml"), overflowConfig());
    const journal = join(state, "journal.jsonl");
    writeOwnerJournal(journal, "0060-headless-runtime", "codex-home-outside-worktree", "old-session", "cleared");
    const oldOverlay = writeOwnedOverlay(state, journal, "old-session");
    const launch = prepareCodexLaunch([], repository, environment(repository, state, home), {
      listCodexMcp: () => ok(configuredNames()),
    });
    expect(isOk(launch)).toBe(true);
    expect(existsSync(oldOverlay)).toBe(false);
  });

  it.each([
    ["held outcome", "held" as const, undefined],
    ["another attempt outcome", "cleared" as const, "new-session"],
    ["person override", undefined, undefined],
    ["lease expiry", undefined, undefined],
  ])("keeps an overlay when termination evidence is only %s", (_name, outcomeKind, anotherSession) => {
    const { repository, state, home } = fixture();
    writeFileSync(join(home, "config.toml"), overflowConfig());
    const journal = join(state, "journal.jsonl");
    writeOwnerJournal(
      journal,
      "0060-headless-runtime",
      "codex-home-outside-worktree",
      "old-session",
      outcomeKind,
      anotherSession,
    );
    if (outcomeKind === undefined && anotherSession === undefined) {
      writeFileSync(journal, `${readFileSync(journal, "utf8")}\n${JSON.stringify({ kind: "person-override" })}`);
    }
    const oldOverlay = writeOwnedOverlay(state, journal, "old-session");
    const launch = prepareCodexLaunch([], repository, environment(repository, state, home), {
      listCodexMcp: () => ok(configuredNames()),
    });
    expect(isOk(launch)).toBe(true);
    expect(existsSync(oldOverlay)).toBe(true);
    if (isOk(launch)) launch.value.cleanup(true);
  });

  it("keeps an expired owner overlay while its child is still running", () => {
    const { repository, state, home } = fixture();
    writeFileSync(join(home, "config.toml"), overflowConfig());
    const journal = join(state, "live-child.jsonl");
    writeOwnerJournal(journal, "0060-headless-runtime", "codex-home-outside-worktree", "live-child-session");
    const oldOverlay = writeOwnedOverlay(state, journal, "live-child-session");
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], { stdio: "ignore" });
    try {
      const launch = prepareCodexLaunch([], repository, environment(repository, state, home, "new-session"), {
        listCodexMcp: () => ok(configuredNames()),
      });
      expect(isOk(launch)).toBe(true);
      expect(existsSync(oldOverlay)).toBe(true);
      if (isOk(launch)) launch.value.cleanup(true);
    } finally {
      child.kill();
    }
  });

  it.each(["codex-homes", "graph", "node", "session"] as const)(
    "does not follow a sentinel symlink at the %s traversal level",
    (level) => {
      const { repository, state, home } = fixture();
      const sentinel = mkdtempSync(join(runsRoot, "overlay-sentinel-"));
      directories.push(sentinel);
      const sentinelFile = join(sentinel, "sentinel.txt");
      writeFileSync(sentinelFile, "untouched\n");
      writeFileSync(join(home, "config.toml"), overflowConfig());
      const root = join(state, "interlock", "codex-homes");
      mkdirSync(join(state, "interlock"));
      if (level === "codex-homes") symlinkSync(sentinel, root, "dir");
      else {
        mkdirSync(root);
        const graph = join(root, "0060-headless-runtime");
        if (level === "graph") symlinkSync(sentinel, graph, "dir");
        else {
          mkdirSync(graph);
          const node = join(graph, "codex-home-outside-worktree");
          if (level === "node") symlinkSync(sentinel, node, "dir");
          else {
            mkdirSync(node);
            symlinkSync(sentinel, join(node, "fixture-session"), "dir");
          }
        }
      }
      const launch = prepareCodexLaunch([], repository, environment(repository, state, home), {
        listCodexMcp: () => ok(configuredNames()),
      });
      expect(isErr(launch)).toBe(true);
      expect(existsSync(sentinel)).toBe(true);
      expect(readFileSync(sentinelFile, "utf8")).toBe("untouched\n");
    },
  );

  it("refuses state inside an unrelated repository", () => {
    const { repository, state, home } = fixture();
    const unrelatedRepository = mkdtempSync(join(runsRoot, "overlay-unrelated-repository-"));
    directories.push(unrelatedRepository);
    initFixtureRepository(unrelatedRepository);
    const unrelatedState = join(unrelatedRepository, "state");
    mkdirSync(unrelatedState);
    writeFileSync(join(home, "config.toml"), overflowConfig());
    const result = prepareCodexLaunch([], repository, {
      ...environment(repository, state, home),
      XDG_STATE_HOME: unrelatedState,
    }, { listCodexMcp: () => ok(configuredNames()) });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.because).toContain("inside another repository");
  });

  it("keeps both checkouts clean after a real Codex launch through the overlay", () => {
    const { repository, state, home } = fixture();
    const worktreeParent = mkdtempSync(join(runsRoot, "overlay-worktree-parent-"));
    directories.push(worktreeParent);
    const worktree = join(worktreeParent, "agent");
    writeFileSync(join(repository, "tracked.txt"), "fixture\n");
    fixtureGit(["add", "--", "tracked.txt"], { cwd: repository });
    fixtureGit(["commit", "--quiet", "-m", "fixture"], { cwd: repository });
    fixtureGit(["worktree", "add", "--quiet", "-b", "fixture-agent", worktree, "HEAD"], { cwd: repository });
    try {
      writeFileSync(join(home, "config.toml"), overflowConfig("/bin/echo"));
      const launch = prepareCodexLaunch([], worktree, environment(worktree, state, home, "real-codex-session"));
      expect(isOk(launch)).toBe(true);
      if (!isOk(launch)) return;
      expect(launch.value.path).toBe("overlay");
      const output = execFileSync("codex", [...launch.value.args, "mcp", "list", "--json"], {
        cwd: worktree,
        env: { ...process.env, ...launch.value.environment },
        encoding: "utf8",
      });
      expect(Array.isArray(JSON.parse(output))).toBe(true);
      expect(fixtureGit(["status", "--porcelain", "--ignored"], { cwd: worktree })).toBe("");
      expect(fixtureGit(["status", "--porcelain", "--ignored"], { cwd: repository })).toBe("");
      launch.value.cleanup(true);
    } finally {
      fixtureGit(["worktree", "remove", "--force", worktree], { cwd: repository });
    }
  });
});

import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { err, isErr, ok } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import { fixtureGit, initFixtureRepository } from "../../../test/support/gitFixture.ts";
import { mergeMainIntoWorktree } from "../src/mergeMain.ts";
import { commitAll } from "./support/gitFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
};

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) execFileSync("rm", ["-r", directory]);
  directory = undefined;
});

function fixtureRoot(): string {
  directory = mkdtempSync(join(runsRoot, "merge-main-"));
  initFixtureRepository(directory, { defaultBranch: "main", env: gitEnv });
  writeFileSync(join(directory, ".gitignore"), "node/\n");
  writeFileSync(join(directory, "base.txt"), "base\n");
  commitAll(directory, "fixture base");
  return directory;
}

function configureSigner(root: string): void {
  const signer = join(root, "signer");
  writeFileSync(
    signer,
    [
      "#!/bin/sh",
      "cat >/dev/null",
      "printf '%s\\n' '-----BEGIN PGP SIGNATURE-----' '' 'Zml4dHVyZQ==' '-----END PGP SIGNATURE-----'",
      "echo '[GNUPG:] SIG_CREATED D 1 10 00 0 0123456789012345678901234567890123456789' >&2",
      "",
    ].join("\n"),
  );
  chmodSync(signer, 0o755);
  fixtureGit(["config", "gpg.format", "openpgp"], { cwd: root, env: gitEnv });
  fixtureGit(["config", "gpg.program", signer], { cwd: root, env: gitEnv });
  fixtureGit(["config", "user.signingkey", "fixture"], { cwd: root, env: gitEnv });
  fixtureGit(["config", "user.name", "Fixture"], { cwd: root, env: gitEnv });
  fixtureGit(["config", "user.email", "fixture@example.invalid"], { cwd: root, env: gitEnv });
}

function createBehindRepository(mainPath: string, mainContent: string): string {
  const root = fixtureRoot();
  const base = fixtureGit(["rev-parse", "main"], { cwd: root, env: gitEnv }).trim();
  const worktree = join(root, "node");
  fixtureGit(["worktree", "add", "--quiet", "-b", "node", worktree, base], {
    cwd: root,
    env: gitEnv,
  });
  writeFileSync(join(worktree, "node.txt"), "node\n");
  commitAll(worktree, "node work");
  writeFileSync(join(root, mainPath), mainContent);
  commitAll(root, "main work");
  fixtureGit(["update-ref", "refs/remotes/origin/main", "main"], { cwd: root, env: gitEnv });
  configureSigner(root);
  return worktree;
}

function worktreeRoot(worktree: string): string {
  return worktree.slice(0, worktree.lastIndexOf("/node"));
}

describe("merge main before judging", () => {
  it("a branch behind main gets a signed merge before the judge", async () => {
    const worktree = createBehindRepository("main.txt", "main\n");
    const result = await mergeMainIntoWorktree({ worktree, node: "judge" });

    expect(result).toEqual(ok({ kind: "merged", mainRef: "origin/main", lockfileChanged: false }));
    const subject = fixtureGit(["log", "-1", "--format=%s"], { cwd: worktree, env: gitEnv });
    expect(subject).toContain("before judging judge");
    expect(fixtureGit(["cat-file", "-p", "HEAD"], { cwd: worktree, env: gitEnv })).toContain(
      "gpgsig -----BEGIN PGP SIGNATURE-----",
    );
  });

  it("a branch already containing main is judged as it is", async () => {
    const root = fixtureRoot();
    writeFileSync(join(root, "main.txt"), "main\n");
    commitAll(root, "main work");
    fixtureGit(["update-ref", "refs/remotes/origin/main", "main"], { cwd: root, env: gitEnv });
    const worktree = join(root, "node");
    fixtureGit(["worktree", "add", "--quiet", "-b", "node", worktree, "main"], {
      cwd: root,
      env: gitEnv,
    });
    const before = fixtureGit(["rev-parse", "HEAD"], { cwd: worktree, env: gitEnv });

    const result = await mergeMainIntoWorktree({ worktree, node: "judge" });

    expect(result).toEqual(ok({ kind: "unchanged", mainRef: "origin/main" }));
    expect(fixtureGit(["rev-parse", "HEAD"], { cwd: worktree, env: gitEnv })).toBe(before);
  });

  it("a dirty tree refuses and changes nothing", async () => {
    const worktree = createBehindRepository("main.txt", "main\n");
    writeFileSync(join(worktree, "base.txt"), "dirty\n");
    const before = fixtureGit(["rev-parse", "HEAD"], { cwd: worktree, env: gitEnv });

    const result = await mergeMainIntoWorktree({ worktree, node: "judge" });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toEqual({ kind: "dirty", paths: ["base.txt"] });
    expect(fixtureGit(["rev-parse", "HEAD"], { cwd: worktree, env: gitEnv })).toBe(before);
  });

  it("leaves a fixture without a main ref unchanged", async () => {
    directory = mkdtempSync(join(runsRoot, "merge-main-no-ref-"));

    const result = await mergeMainIntoWorktree({ worktree: directory, node: "judge" });

    expect(result).toEqual(ok({ kind: "unchanged", mainRef: undefined }));
  });

  it("a conflict refuses naming the files and leaves no merge in progress", async () => {
    const root = fixtureRoot();
    const base = fixtureGit(["rev-parse", "main"], { cwd: root, env: gitEnv }).trim();
    const worktree = join(root, "node");
    fixtureGit(["worktree", "add", "--quiet", "-b", "node", worktree, base], {
      cwd: root,
      env: gitEnv,
    });
    writeFileSync(join(worktree, "base.txt"), "node\n");
    commitAll(worktree, "node conflict");
    writeFileSync(join(root, "base.txt"), "main\n");
    commitAll(root, "main conflict");
    fixtureGit(["update-ref", "refs/remotes/origin/main", "main"], { cwd: root, env: gitEnv });
    configureSigner(root);
    const before = fixtureGit(["rev-parse", "HEAD"], { cwd: worktree, env: gitEnv });

    const result = await mergeMainIntoWorktree({ worktree, node: "judge" });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    if (result.error.kind !== "conflict") return;
    expect(result.error.paths).toContain("base.txt");
    expect(fixtureGit(["rev-parse", "HEAD"], { cwd: worktree, env: gitEnv })).toBe(before);
    expect(() =>
      fixtureGit(["rev-parse", "--verify", "--quiet", "MERGE_HEAD"], {
        cwd: worktree,
        env: gitEnv,
      }),
    ).toThrow();
  });

  it("the install runs only when the lockfile changed", async () => {
    const worktree = createBehindRepository("pnpm-lock.yaml", "lock\n");
    const installs: string[] = [];
    const result = await mergeMainIntoWorktree({
      worktree,
      node: "judge",
      install: async (path, env, heavy) => {
        installs.push(`${path}:${env["GIT_CONFIG_GLOBAL"] ?? ""}:${heavy.join(" ")}`);
        return ok(undefined);
      },
    });

    expect(result).toEqual(ok({ kind: "merged", mainRef: "origin/main", lockfileChanged: true }));
    expect(installs).toHaveLength(1);

    const unchangedWorktree = join(worktreeRoot(worktree), "unchanged");
    const root = worktreeRoot(worktree);
    fixtureGit(
      ["worktree", "add", "--quiet", "-b", "unchanged", unchangedWorktree, "origin/main"],
      {
        cwd: root,
        env: gitEnv,
      },
    );
    const before = installs.length;
    const unchanged = await mergeMainIntoWorktree({
      worktree: unchangedWorktree,
      node: "judge",
      install: async () => {
        installs.push("unexpected");
        return err("unexpected install");
      },
    });

    expect(unchanged).toEqual(ok({ kind: "unchanged", mainRef: "origin/main" }));
    expect(installs).toHaveLength(before);
  });
});

import { closeSync, existsSync, lstatSync, openSync, readFileSync, readSync } from "node:fs";
import { join, matchesGlob, posix, win32 } from "node:path";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import {
  briefFilePath,
  debriefFilePath,
  explainBriefRefusal,
  explainDebriefRefusal,
  explainNotesRefusal,
  explainRoleTableRefusal,
  notesFilePath,
  readBriefFile,
  readDebriefFile,
  readNotesFile,
  readRoleTable,
  roleKindsRefusal,
} from "debrief";
import { isNodeRole } from "ledger";
import { parse as parseYaml } from "yaml";
import { isRecord, isString, isStringArray, prop } from "./validate.ts";
import {
  commitPaths,
  explainWorktreeRefusal,
  resetCommits,
  uncommittedPaths,
  worktreeHead,
} from "./worktree.ts";

export interface CommitEntry {
  readonly message: string;
  readonly paths: readonly string[];
}

export interface CommitPlan {
  readonly entries: readonly CommitEntry[];
  readonly fallbackSubject: string | undefined;
  readonly coAuthoredBy: string | undefined;
}

export function literalCommitPath(path: string): boolean {
  return (
    path.length > 0 &&
    !posix.isAbsolute(path) &&
    !win32.isAbsolute(path) &&
    !path.includes("\0") &&
    !/[\\*?[\]{}]/.test(path) &&
    path.split("/").every((part) => part !== "" && part !== "." && part !== "..")
  );
}

function validMessage(value: unknown): value is string {
  return (
    isString(value) &&
    value.trim().length > 0 &&
    (value.split("\n")[0]?.trim().length ?? 0) > 0 &&
    (value.split("\n")[0]?.length ?? 101) <= 100 &&
    !value.includes("\0")
  );
}

export function parseCommitPlan(value: unknown): Result<CommitPlan, string> {
  if (!isRecord(value) || prop(value, "interlock") !== "commits@v0") {
    return err("commits.yaml requires commits@v0");
  }
  const raw = prop(value, "entries");
  if (!Array.isArray(raw)) return err("commits.yaml entries must be a list");
  const entries: CommitEntry[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!isRecord(entry)) return err("commits.yaml entry must be a mapping");
    const message = prop(entry, "message");
    const paths = prop(entry, "paths");
    if (!validMessage(message))
      return err("commit message must be nonempty with a first line at most 100 characters");
    if (!isStringArray(paths) || paths.length === 0)
      return err("commit paths must be a nonempty list");
    for (const path of paths) {
      if (!literalCommitPath(path))
        return err(`${path}: commit path must be literal and repository-relative`);
      if (seen.has(path)) return err(`${path}: duplicate path in commits.yaml`);
      seen.add(path);
    }
    entries.push({ message, paths });
  }
  const fallbackSubject = prop(value, "fallback_subject");
  if (
    fallbackSubject !== undefined &&
    (!validMessage(fallbackSubject) || /[\r\n]/.test(fallbackSubject))
  ) {
    return err("fallback_subject must be a nonempty subject at most 100 characters");
  }
  const coAuthoredBy = prop(value, "co_authored_by");
  if (
    coAuthoredBy !== undefined &&
    (!isString(coAuthoredBy) || coAuthoredBy.trim().length === 0 || /[\r\n\0]/.test(coAuthoredBy))
  ) {
    return err("co_authored_by must be a nonempty single line");
  }
  return ok({ entries, fallbackSubject, coAuthoredBy });
}

export interface CommitCustody {
  readonly worktree: string;
  readonly graph: string;
  readonly node: string;
  readonly paths?: readonly string[];
  readonly session: string;
  readonly runtime: string;
  readonly model: string | undefined;
}

export function sessionArtifact(
  path: string,
  graph: string,
  node: string,
  worktree?: string,
): boolean {
  const prefix = `.interlock/sessions/${graph}/${node}/`;
  if (!path.startsWith(prefix)) return false;
  const name = path.slice(prefix.length);
  if (
    ["notes.yaml", "debrief.yaml", "commits.yaml"].includes(name) ||
    name.startsWith("revisions/") ||
    (!name.includes("/") && /(?:^|\.)candidate\.yaml(?:\..+)?$/.test(name)) ||
    (!name.includes("/") && /\.sources?\.yaml$/.test(name))
  )
    return true;
  if (worktree === undefined || !name.endsWith(".yaml")) return false;
  try {
    return /^interlock: debrief@v[0-9]+\r?$/m.test(readFileSync(join(worktree, path), "utf-8"));
  } catch {
    return false;
  }
}

export function declaredCommitPath(path: string, request: CommitCustody): boolean {
  if (!literalCommitPath(path) || path === ".git" || path.startsWith(".git/")) return false;
  const own = `.interlock/sessions/${request.graph}/${request.node}/`;
  if (path.startsWith(own)) return true;
  if (request.paths !== undefined)
    return request.paths.some((pattern) => matchesGlob(path, pattern));
  return !path.startsWith(".interlock/sessions/") && !path.startsWith(".interlock/graphs/");
}

const SECRET_NAMES: readonly [string, RegExp][] = [
  [".env", /^\.env$/],
  [".env.*", /^\.env\./],
  ["*.pem", /\.pem$/],
  ["*.key", /\.key$/],
  ["*.p12", /\.p12$/],
  ["*.pfx", /\.pfx$/],
  ["id_rsa*", /^id_rsa/],
  ["id_ed25519*", /^id_ed25519/],
  ["*credentials*", /credentials/],
  ["*.keystore", /\.keystore$/],
  [".npmrc", /^\.npmrc$/],
  [".pypirc", /^\.pypirc$/],
  [".netrc", /^\.netrc$/],
];
const SECRET_CONTENT: readonly [string, RegExp][] = [
  ["PEM private-key header", /-{5}BEGIN[^\r\n]*PRIVATE KEY-{5}/],
  ["AWS access key id", /AKIA[A-Z0-9]{16}/],
  ["GitHub token", /(?:ghp_|gho_|ghs_|github_pat_)\w{20,}/],
];

function secretRule(worktree: string, path: string): string | undefined {
  for (const [rule, pattern] of SECRET_NAMES) {
    if (path.split("/").some((part) => pattern.test(part))) return rule;
  }
  const absolute = join(worktree, path);
  let descriptor: number | undefined;
  try {
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) return "symbolic link cannot be inspected safely";
    if (!stat.isFile()) return "changed path is not a regular file";
    descriptor = openSync(absolute, "r");
    const buffer = Buffer.alloc(64 * 1024);
    const length = readSync(descriptor, buffer, 0, buffer.length, 0);
    const content = buffer.toString("utf-8", 0, length);
    return SECRET_CONTENT.find(([, pattern]) => pattern.test(content))?.[0];
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    return "content could not be inspected";
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function checkedPaths(request: CommitCustody): Result<readonly string[], string> {
  const dirty = uncommittedPaths(request.worktree, true);
  if (isErr(dirty)) return err(explainWorktreeRefusal(dirty.error));
  const refusals: string[] = [];
  for (const path of dirty.value) {
    if (!declaredCommitPath(path, request)) refusals.push(`${path}: outside declared paths`);
    const rule = secretRule(request.worktree, path);
    if (rule !== undefined) refusals.push(`${path}: ${rule}`);
  }
  return refusals.length > 0 ? err(refusals.join("; ")) : dirty;
}

function trailers(request: CommitCustody, plan: CommitPlan): readonly string[] {
  return [
    `Attempt: ${request.session}`,
    `Runtime: ${request.runtime} (${request.model ?? "model undeclared"})`,
    ...(plan.coAuthoredBy === undefined
      ? []
      : [
          plan.coAuthoredBy.startsWith("Co-Authored-By:")
            ? plan.coAuthoredBy
            : `Co-Authored-By: ${plan.coAuthoredBy}`,
        ]),
  ];
}

function commitSequence(
  request: CommitCustody,
  entries: readonly CommitEntry[],
  plan: CommitPlan,
): Result<string, string> {
  const initial = worktreeHead(request.worktree);
  if (isErr(initial)) return err(explainWorktreeRefusal(initial.error));
  let head = initial.value;
  for (const entry of entries) {
    const committed = commitPaths(
      request.worktree,
      entry.paths,
      entry.message,
      trailers(request, plan),
    );
    if (isErr(committed)) {
      const reset = resetCommits(request.worktree, initial.value);
      return err(
        explainWorktreeRefusal(committed.error) +
          (isErr(reset) ? `; rollback failed: ${explainWorktreeRefusal(reset.error)}` : ""),
      );
    }
    head = committed.value;
  }
  return ok(head);
}

export interface CommittedCode {
  readonly head: string;
  readonly plan: CommitPlan;
}

export function commitRunnerCode(request: CommitCustody): Result<CommittedCode, string> {
  const dirty = checkedPaths(request);
  if (isErr(dirty)) return dirty;
  let value: unknown;
  try {
    value = parseYaml(
      readFileSync(
        join(request.worktree, `.interlock/sessions/${request.graph}/${request.node}/commits.yaml`),
        "utf-8",
      ),
    );
  } catch {
    return err("commits.yaml is missing, unreadable or invalid YAML");
  }
  const parsed = parseCommitPlan(value);
  if (isErr(parsed)) return parsed;
  const plan = parsed.value;
  const codePaths = dirty.value.filter(
    (path) => !sessionArtifact(path, request.graph, request.node, request.worktree),
  );
  const named = new Set<string>();
  for (const entry of plan.entries) {
    for (const path of entry.paths) {
      if (sessionArtifact(path, request.graph, request.node, request.worktree))
        return err(`${path}: reserved session artifact`);
      if (!codePaths.includes(path)) return err(`${path}: path did not change`);
      named.add(path);
    }
  }
  const remainder = codePaths.filter((path) => !named.has(path));
  if (remainder.length > 0 && plan.fallbackSubject === undefined)
    return err(`${remainder.join(", ")}: missing fallback_subject`);
  const entries = [...plan.entries];
  if (remainder.length > 0 && plan.fallbackSubject !== undefined)
    entries.push({ paths: remainder, message: plan.fallbackSubject });
  const committed = commitSequence(request, entries, plan);
  return isErr(committed) ? committed : ok({ head: committed.value, plan });
}

export async function commitRunnerDebrief(
  request: CommitCustody,
  code: CommittedCode,
): Promise<Result<string, string>> {
  const dirty = checkedPaths(request);
  if (isErr(dirty)) return dirty;
  const current = worktreeHead(request.worktree);
  if (isErr(current)) return err(explainWorktreeRefusal(current.error));
  if (current.value !== code.head) return err("HEAD changed after code phase");
  const debrief = await readDebriefFile(
    debriefFilePath(request.worktree, request.graph, request.node),
  );
  if (isErr(debrief)) return err(explainDebriefRefusal(debrief.error));
  if (
    debrief.value.kind !== "v2" ||
    debrief.value.debrief.headSha !== code.head ||
    debrief.value.debrief.graph !== request.graph ||
    debrief.value.debrief.node !== request.node
  )
    return err("debrief head_sha must be the last code commit");
  const brief = await readBriefFile(briefFilePath(request.worktree, request.graph, request.node));
  if (isErr(brief)) return err(explainBriefRefusal(brief.error));
  if (brief.value.kind !== "v1" || brief.value.frontMatter.role !== debrief.value.debrief.role)
    return err("debrief role must match the brief");
  const notes = await readNotesFile(notesFilePath(request.worktree, request.graph, request.node));
  if (isErr(notes) && notes.error.kind !== "missing-file")
    return err(explainNotesRefusal(notes.error));
  const role = brief.value.frontMatter.role;
  if (isNodeRole(role)) {
    const table = await readRoleTable(request.worktree);
    if (isErr(table)) return err(explainRoleTableRefusal(table.error));
    const refusal = roleKindsRefusal(role, table.value[role], debrief.value.debrief, (path) =>
      existsSync(join(request.worktree, path)),
    );
    if (refusal !== undefined) return err(refusal);
  }
  const unexpected = dirty.value.filter(
    (path) => !sessionArtifact(path, request.graph, request.node, request.worktree),
  );
  if (unexpected.length > 0) return err(`${unexpected.join(", ")}: still dirty after code phase`);
  const committed = commitSequence(
    request,
    dirty.value.length === 0
      ? []
      : [
          {
            paths: dirty.value,
            message: `chore: preserve the debrief for ${request.node}`.slice(0, 100),
          },
        ],
    code.plan,
  );
  if (isErr(committed)) return committed;
  const remaining = uncommittedPaths(request.worktree);
  if (isErr(remaining)) return err(explainWorktreeRefusal(remaining.error));
  return remaining.value.length > 0
    ? err(`${remaining.value.join(", ")}: still dirty after debrief commit`)
    : committed;
}

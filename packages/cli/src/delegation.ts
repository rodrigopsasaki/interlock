import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import { type DelegatedDerivation, derivation, type LedgerProjection } from "ledger";
import { loadLocalConfig, loadMachine, providerArgv, runProviderCommand } from "runner";
import { type GitHostAdapter, type GitHubCommentCite, githubAdapter } from "./gitHostAdapter.ts";

export type Citation =
  | { readonly kind: "said"; readonly id: string; readonly literal: string }
  | { readonly kind: "msg"; readonly id: string; readonly literal: string }
  | GitHubCommentCite;

export interface VerifiedCitation {
  readonly cite: Citation;
  readonly key: string;
  readonly author: string;
  readonly words: string;
  readonly at: string | number;
}

export type DelegatedAction = "approve" | "clear" | "publish";

export interface DelegatedTarget {
  readonly graph: string;
  readonly node?: string;
  readonly gate?: string;
}

export interface DelegationOptions {
  readonly gitHost?: GitHostAdapter;
  readonly machinePath?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const SAID = /^said:([A-Za-z0-9_-]{1,128})$/;
const MSG = /^msg:([A-Za-z0-9_-]{1,128})$/;
const COMMENT =
  /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/(issues|pull)\/(\d+)#issuecomment-(\d+)$/;

export function parseCitation(literal: string): Citation | undefined {
  const said = SAID.exec(literal);
  if (said !== null) {
    const id = said[1];
    return id === undefined ? undefined : { kind: "said", id, literal };
  }
  const msg = MSG.exec(literal);
  if (msg !== null) {
    const id = msg[1];
    return id === undefined ? undefined : { kind: "msg", id, literal };
  }
  const comment = COMMENT.exec(literal);
  if (comment === null) return undefined;
  const owner = comment[1];
  const repository = comment[2];
  const kind = comment[3];
  const number = comment[4];
  const commentId = comment[5];
  if (
    owner === undefined ||
    repository === undefined ||
    number === undefined ||
    commentId === undefined ||
    (kind !== "issues" && kind !== "pull")
  ) {
    return undefined;
  }
  return { literal, owner, repository, kind, number, commentId };
}

function firstLine(value: string): string {
  return value.split(/\r?\n/)[0] ?? value;
}

function citeActionWord(action: DelegatedAction): string {
  switch (action) {
    case "approve":
      return "approve";
    case "clear":
      return "clear";
    case "publish":
      return "publish";
  }
}

export async function verifyCitation(
  repoRoot: string,
  owner: string,
  by: string,
  literal: string,
  action: DelegatedAction,
  options: DelegationOptions = {},
): Promise<Result<VerifiedCitation, string>> {
  const citation = parseCitation(literal);
  if (citation === undefined) {
    return err(
      `${by} can ${citeActionWord(action)} for ${owner} only on his own words; this cite is not a known cite.`,
    );
  }
  if (citation.kind === "issues" || citation.kind === "pull") {
    const local = await loadLocalConfig(repoRoot);
    if (isErr(local))
      return err(
        `cannot verify cite: ${local.error.kind === "missing" ? "owner_login is not configured" : local.error.reason}`,
      );
    if (local.value.ownerLogin === undefined)
      return err("cannot verify comment cite: local.yaml has no owner_login");
    const host = options.gitHost ?? githubAdapter;
    const verified = await host.verifyComment(citation, repoRoot);
    if (isErr(verified)) return err(`cannot verify comment cite: ${verified.error}`);
    if (verified.value.author.toLowerCase() !== local.value.ownerLogin.toLowerCase()) {
      return err(
        `${by} can ${citeActionWord(action)} for ${owner} only on his own words; this cite is not his.`,
      );
    }
    return ok({
      cite: citation,
      key: verified.value.key,
      author: verified.value.author,
      words: verified.value.words,
      at: verified.value.at,
    });
  }

  const machine = await loadMachine(options.machinePath);
  if (isErr(machine)) return err(machine.error);
  if (machine.value === "none" || machine.value.cite === undefined) {
    return err("cannot verify said/msg cite: machine.provider.cite is not configured");
  }
  if (citation.kind !== "said" && citation.kind !== "msg") {
    return err("cannot verify cite: unsupported citation kind");
  }
  const result = await runProviderCommand(
    providerArgv(machine.value.cite, { kind: citation.kind, id: citation.id }),
    repoRoot,
  );
  if (result.code !== 0)
    return err(`cite provider exited ${result.code}: ${firstLine(result.output)}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return err("cite provider must print a JSON object");
  }
  if (!isRecord(parsed)) {
    return err("cite provider must print a JSON object");
  }
  if (parsed["verified"] !== true) {
    return err(
      `${by} can ${citeActionWord(action)} for ${owner} only on his own words; this cite is not his.`,
    );
  }
  const author = parsed["author"];
  const words = parsed["words"];
  const at = parsed["at"];
  if (
    typeof author !== "string" ||
    typeof words !== "string" ||
    (typeof at !== "string" && typeof at !== "number")
  ) {
    return err("cite provider must print verified, author, words and at");
  }
  if (author !== owner) {
    return err(
      `${by} can ${citeActionWord(action)} for ${owner} only on his own words; this cite is not his.`,
    );
  }
  return ok({ cite: citation, key: `${citation.kind}:${citation.id}`, author, words, at });
}

export async function contentHash(path: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

export function delegatedDerivation(
  by: string,
  owner: string,
  verified: VerifiedCitation,
  reading: string,
  action: DelegatedAction,
  target: DelegatedTarget,
  hash: string,
): DelegatedDerivation {
  return derivation.delegated({
    who: `${by} for ${owner}`,
    for: owner,
    cite: verified.cite.literal,
    citeKey: verified.key,
    author: verified.author,
    words: verified.words,
    at: verified.at,
    reading,
    action,
    target,
    contentHash: hash,
  });
}

export function delegatedReceipt(
  projection: LedgerProjection,
  key: string,
):
  | {
      readonly derivation: DelegatedDerivation;
      readonly action: string;
      readonly target: DelegatedTarget;
    }
  | undefined {
  const candidate = projection.consumedCites.get(key);
  return candidate === undefined
    ? undefined
    : { derivation: candidate, action: candidate.action, target: candidate.target };
}

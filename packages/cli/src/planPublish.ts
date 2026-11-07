import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { type Clock, createSystemClock } from "@phyxiusjs/clock";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import {
  explainGraphRefusal,
  findRepoRoot,
  graphFilePath,
  loadGraphDocument,
  sharedJournalDirectory,
} from "face";
import {
  createLedger,
  type Derivation,
  derivation,
  type Ledger,
  type Node,
  OUTBOX_INTENT_SHAPE,
  type OutboxIntent,
  retainOutboxArtifact,
} from "ledger";
import { parse as parseYaml } from "yaml";
import {
  delegatedDerivation,
  delegatedReceipt,
  type VerifiedCitation,
  verifyCitation,
} from "./delegation.ts";
import { parseFlag, parseFlagValue } from "./flags.ts";
import {
  type GitHostAdapter,
  type GitHostPullRequest,
  githubAdapter,
  type PlanPushRequest,
  type PullRequestQuery,
  type PullRequestRequest,
} from "./gitHostAdapter.ts";
import type { CommandResult } from "./main.ts";
import { gitOrigin, repositoryForOrigin } from "./repositoryOrigin.ts";

const GRAPH_ID = /^[0-9]{4}-[a-z0-9-]+$/;
const SESSION = "plan-publish";
const NODE_ID = "plan-publish";

interface ArcRecord {
  readonly id: string;
  readonly ask: string;
  readonly source: string;
}

interface PlanPushPayload {
  readonly kind: "push";
  readonly graph: string;
  readonly sourceSha: string;
  readonly branch: string;
  readonly refspec: string;
}

interface PullRequestPayload {
  readonly kind: "pull-request";
  readonly graph: string;
  readonly branch: string;
  readonly base: string;
  readonly title: string;
  readonly body: string;
}

type PublicationPayload = PlanPushPayload | PullRequestPayload;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function prop(value: Record<string, unknown>, key: string): unknown {
  return value[key];
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function firstLine(value: string): string {
  return value.split(/\r?\n/)[0] ?? value;
}

function missingDelegationValue(flag: string): CommandResult {
  return {
    exitCode: 1,
    message: `interlock plan publish: ${flag} must carry a value when present.`,
  };
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function effectId(kind: PublicationPayload["kind"], graph: string, graphHash: string): string {
  return sha256(JSON.stringify(["plan-publish", kind, graph, graphHash]));
}

function isPlanPushPayload(value: unknown): value is PlanPushPayload {
  if (!isRecord(value)) return false;
  return (
    prop(value, "kind") === "push" &&
    isString(prop(value, "graph")) &&
    isString(prop(value, "sourceSha")) &&
    isString(prop(value, "branch")) &&
    isString(prop(value, "refspec"))
  );
}

function isPullRequestPayload(value: unknown): value is PullRequestPayload {
  if (!isRecord(value)) return false;
  return (
    prop(value, "kind") === "pull-request" &&
    isString(prop(value, "graph")) &&
    isString(prop(value, "branch")) &&
    isString(prop(value, "base")) &&
    isString(prop(value, "title")) &&
    isString(prop(value, "body"))
  );
}

function parsePayload(
  raw: Buffer,
  kind: PublicationPayload["kind"],
): Result<PublicationPayload, string> {
  let value: unknown;
  try {
    value = JSON.parse(raw.toString("utf8"));
  } catch {
    return err("plan publish: retained intent is not valid JSON");
  }
  if (kind === "push" && isPlanPushPayload(value)) return ok(value);
  if (kind === "pull-request" && isPullRequestPayload(value)) return ok(value);
  return err("plan publish: retained intent has an incompatible payload");
}

function parseArcs(raw: string): Result<readonly ArcRecord[], string> {
  let value: unknown;
  try {
    value = parseYaml(raw);
  } catch {
    return err(".interlock/arcs.yaml: malformed arcs@v0 document");
  }
  if (!isRecord(value) || prop(value, "interlock") !== "arcs@v0") {
    return err(".interlock/arcs.yaml: expected an arcs@v0 document");
  }
  const entries = prop(value, "arcs");
  if (!Array.isArray(entries)) return err(".interlock/arcs.yaml: arcs must be a list");
  const arcs: ArcRecord[] = [];
  for (const entry of entries) {
    if (!isRecord(entry)) return err(".interlock/arcs.yaml: arc entry must be a mapping");
    const id = prop(entry, "id");
    const ask = prop(entry, "ask");
    const source = prop(entry, "source");
    if (!isString(id) || !isString(ask) || !isString(source)) {
      return err(".interlock/arcs.yaml: every arc needs id, ask and source");
    }
    arcs.push({ id, ask, source });
  }
  return ok(arcs);
}

async function readArc(
  repoRoot: string,
  arcId: string | undefined,
): Promise<Result<ArcRecord, string>> {
  if (arcId === undefined)
    return err("interlock plan publish: graph has no arc; publication requires an arc.");
  let raw: string;
  try {
    raw = await readFile(join(repoRoot, ".interlock", "arcs.yaml"), "utf8");
  } catch {
    return err(`interlock plan publish: arc "${arcId}" is not in .interlock/arcs.yaml.`);
  }
  const arcs = parseArcs(raw);
  if (isErr(arcs)) return err(arcs.error);
  const found = arcs.value.find((candidate) => candidate.id === arcId);
  return found === undefined
    ? err(`interlock plan publish: arc "${arcId}" is not in .interlock/arcs.yaml.`)
    : ok(found);
}

function gitText(cwd: string, args: readonly string[]): Promise<Result<string, string>> {
  return new Promise((resolve) => {
    execFile("git", args, { cwd, encoding: "utf8" }, (error, stdout, stderr) => {
      if (error !== null) {
        resolve(err(firstLine(stderr || error.message)));
        return;
      }
      resolve(ok(stdout));
    });
  });
}

async function committedGraph(
  repoRoot: string,
  graphPath: string,
  graph: string,
  worktreeBytes: Buffer,
): Promise<Result<{ readonly sourceSha: string; readonly graphHash: string }, string>> {
  const relativePath = relative(repoRoot, graphPath);
  const tracked = await gitText(repoRoot, ["ls-files", "--error-unmatch", "--", relativePath]);
  if (isErr(tracked) || tracked.value.trim() !== relativePath) {
    return err(`interlock plan publish: graph "${graph}" is untracked; nothing was published.`);
  }
  const status = await gitText(repoRoot, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--",
    relativePath,
  ]);
  if (isErr(status))
    return err(`interlock plan publish: cannot inspect graph status: ${status.error}`);
  if (status.value.split(/\r?\n/).some((line) => line.startsWith("?? "))) {
    return err(`interlock plan publish: graph "${graph}" is untracked; nothing was published.`);
  }
  const source = await gitText(repoRoot, ["rev-parse", "HEAD"]);
  if (isErr(source))
    return err(`interlock plan publish: cannot resolve source commit: ${source.error}`);
  const committed = await gitText(repoRoot, ["show", `${source.value.trim()}:${relativePath}`]);
  if (isErr(committed)) {
    return err(
      `interlock plan publish: graph "${graph}" is not present at ${source.value.trim()}.`,
    );
  }
  const committedBytes = Buffer.from(committed.value, "utf8");
  if (!committedBytes.equals(worktreeBytes)) {
    return err(
      `interlock plan publish: graph "${graph}" differs from ${source.value.trim()}; commit it before publishing.`,
    );
  }
  return ok({ sourceSha: source.value.trim(), graphHash: sha256(worktreeBytes) });
}

function delegatedActionMatches(intent: OutboxIntent, graph: string, graphHash: string): boolean {
  const source = intent.derivation;
  return (
    source.kind === "human" &&
    "action" in source &&
    source.action === "publish" &&
    source.target.graph === graph &&
    source.contentHash === graphHash
  );
}

function hasExistingPublication(ledger: Ledger, graph: string, graphHash: string): boolean {
  return [...ledger.projection().outbox.values()].some((view) =>
    delegatedActionMatches(view.intent, graph, graphHash),
  );
}

function publicationDerivation(
  by: string,
  owner: string | undefined,
  verified: VerifiedCitation | undefined,
  reading: string | undefined,
  graph: string,
  graphHash: string,
): Derivation {
  if (owner === undefined || verified === undefined || reading === undefined) {
    return derivation.human(by);
  }
  return delegatedDerivation(by, owner, verified, reading, "publish", { graph }, graphHash);
}

async function ensureIntent(
  ledger: Ledger,
  id: string,
  node: Node,
  repository: OutboxIntent["repository"],
  target: string,
  payload: PublicationPayload,
  source: Derivation,
): Promise<
  Result<{ readonly intent: OutboxIntent; readonly payload: PublicationPayload }, string>
> {
  const existing = ledger.projection().outbox.get(id);
  if (existing !== undefined) {
    const evidence = ledger.readOutboxEvidence(node, SESSION, id);
    if (evidence.kind !== "verified")
      return err("plan publish: retained intent evidence is unavailable");
    const parsed = parsePayload(evidence.request, payload.kind);
    return isErr(parsed) ? parsed : ok({ intent: existing.intent, payload: parsed.value });
  }
  const request = retainOutboxArtifact(
    ledger.directory(),
    "request",
    Buffer.from(JSON.stringify(payload)),
  );
  if (isErr(request)) return err(`plan publish: cannot retain ${target} intent`);
  const intent: OutboxIntent = {
    interlock: OUTBOX_INTENT_SHAPE,
    id,
    node,
    session: SESSION,
    target,
    ...(repository === undefined ? {} : { repository }),
    request: request.value,
    derivation: source,
  };
  const saved = ledger.appendConfirmed({ kind: "outbox-intent-recorded", node, effect: intent });
  return isErr(saved)
    ? err(`plan publish: cannot confirm ${target} intent`)
    : ok({ intent, payload });
}

function acknowledged(ledger: Ledger, intent: OutboxIntent): boolean {
  const evidence = ledger.readOutboxEvidence(intent.node, intent.session, intent.id);
  return evidence.kind === "verified" && evidence.delivery?.state === "acknowledged";
}

function recordDelivery(
  ledger: Ledger,
  intent: OutboxIntent,
  result: Result<unknown, string>,
): Result<void, string> {
  if (isErr(result)) {
    ledger.append({
      kind: "outbox-delivery-recorded",
      delivery: {
        id: intent.id,
        state: "uncertain",
        because: result.error,
        derivation: intent.derivation,
      },
    });
    return result;
  }
  const acknowledgment = retainOutboxArtifact(
    ledger.directory(),
    "acknowledgment",
    Buffer.from(JSON.stringify(result.value)),
  );
  if (isErr(acknowledgment)) {
    const because = "plan publish: cannot retain acknowledgment";
    ledger.append({
      kind: "outbox-delivery-recorded",
      delivery: { id: intent.id, state: "uncertain", because, derivation: intent.derivation },
    });
    return err(because);
  }
  ledger.append({
    kind: "outbox-delivery-recorded",
    delivery: {
      id: intent.id,
      state: "acknowledged",
      because: "confirmed plan publication effect",
      derivation: intent.derivation,
      acknowledgment: acknowledgment.value,
    },
  });
  return ok(undefined);
}

async function dispatchPush(
  ledger: Ledger,
  intent: OutboxIntent,
  payload: PlanPushPayload,
  adapter: GitHostAdapter,
  repository: NonNullable<OutboxIntent["repository"]>,
  cwd: string,
): Promise<Result<void, string>> {
  if (acknowledged(ledger, intent)) return ok(undefined);
  if (adapter.pushPlanBranch === undefined)
    return recordDelivery(
      ledger,
      intent,
      err("plan publish: git-host adapter cannot push plan branches"),
    );
  const request: PlanPushRequest = {
    cwd,
    repository,
    branch: payload.branch,
    refspec: payload.refspec,
  };
  const pushed = await adapter.pushPlanBranch(request);
  return recordDelivery(ledger, intent, pushed);
}

async function dispatchPullRequest(
  ledger: Ledger,
  intent: OutboxIntent,
  payload: PullRequestPayload,
  adapter: GitHostAdapter,
  repository: NonNullable<OutboxIntent["repository"]>,
  cwd: string,
): Promise<Result<GitHostPullRequest, string>> {
  if (acknowledged(ledger, intent)) {
    return ok({ key: `pull:${intent.id}` });
  }
  if (adapter.findPullRequest === undefined || adapter.openPullRequest === undefined) {
    const refusal = err("plan publish: git-host adapter cannot reconcile pull requests");
    recordDelivery(ledger, intent, refusal);
    return refusal;
  }
  const query: PullRequestQuery = { cwd, repository, branch: payload.branch, base: payload.base };
  const existing = await adapter.findPullRequest(query);
  if (isErr(existing)) {
    recordDelivery(ledger, intent, existing);
    return existing;
  }
  if (existing.value !== undefined) {
    const saved = recordDelivery(ledger, intent, ok(existing.value));
    return isErr(saved) ? saved : ok(existing.value);
  }
  const request: PullRequestRequest = { ...query, title: payload.title, body: payload.body };
  const opened = await adapter.openPullRequest(request);
  const saved = recordDelivery(ledger, intent, opened);
  return isErr(saved) ? saved : opened;
}

export async function runPlanPublish(
  args: readonly string[],
  options: {
    readonly cwd?: string;
    readonly clock?: Clock;
    readonly gitHost?: GitHostAdapter;
    readonly machinePath?: string;
  } = {},
): Promise<CommandResult> {
  const [graph] = args;
  if (graph === undefined) {
    return { exitCode: 1, message: "interlock plan publish: expected a graph id." };
  }
  if (!GRAPH_ID.test(graph)) {
    return { exitCode: 1, message: `interlock plan publish: graph id "${graph}" is invalid.` };
  }
  const by = parseFlag(args, "--by");
  if (by === undefined)
    return { exitCode: 1, message: "interlock plan publish: refuses without --by." };
  const forFlag = parseFlagValue(args, "--for");
  const citesFlag = parseFlagValue(args, "--cites");
  const readingFlag = parseFlagValue(args, "--reading");
  if (forFlag.kind === "invalid") return missingDelegationValue("--for");
  if (citesFlag.kind === "invalid") return missingDelegationValue("--cites");
  if (readingFlag.kind === "invalid") return missingDelegationValue("--reading");
  if (forFlag.kind === "absent" && citesFlag.kind !== "absent") {
    return { exitCode: 1, message: "interlock plan publish: --cites requires --for." };
  }
  if (forFlag.kind === "value" && citesFlag.kind === "absent") {
    return { exitCode: 1, message: "interlock plan publish: --for requires --cites." };
  }
  if (forFlag.kind === "value" && readingFlag.kind !== "value") {
    return { exitCode: 1, message: "interlock plan publish: --for requires --reading." };
  }
  const cwd = options.cwd ?? process.cwd();
  const repoRoot = findRepoRoot(cwd);
  if (repoRoot === undefined) {
    return {
      exitCode: 1,
      message: `${cwd}: no .interlock directory found in this directory or any parent.`,
    };
  }
  const graphPath = graphFilePath(repoRoot, graph);
  const graphDocument = await loadGraphDocument(graphPath);
  if (isErr(graphDocument))
    return { exitCode: 1, message: explainGraphRefusal(graphDocument.error) };
  if (graphDocument.value.id !== graph) {
    return {
      exitCode: 1,
      message: `interlock plan publish: graph file id "${graphDocument.value.id}" does not equal "${graph}".`,
    };
  }
  const arc = await readArc(repoRoot, graphDocument.value.arc);
  if (isErr(arc)) return { exitCode: 1, message: arc.error };
  const worktreeBytes = await readFile(graphPath);
  const committed = await committedGraph(repoRoot, graphPath, graph, worktreeBytes);
  if (isErr(committed)) return { exitCode: 1, message: committed.error };
  const graphHash = committed.value.graphHash;
  let verified: VerifiedCitation | undefined;
  if (forFlag.kind === "value" && citesFlag.kind === "value" && readingFlag.kind === "value") {
    const checked = await verifyCitation(repoRoot, forFlag.value, by, citesFlag.value, "publish", {
      ...(options.gitHost === undefined ? {} : { gitHost: options.gitHost }),
      ...(options.machinePath === undefined ? {} : { machinePath: options.machinePath }),
    });
    if (isErr(checked)) return { exitCode: 1, message: checked.error };
    verified = checked.value;
  }
  const origin = await gitOrigin(repoRoot);
  if (isErr(origin)) return { exitCode: 1, message: `interlock plan publish: ${origin.error}.` };
  const repository = repositoryForOrigin(origin.value);
  if (isErr(repository))
    return { exitCode: 1, message: `interlock plan publish: ${repository.error}.` };
  const journal = await sharedJournalDirectory(repoRoot);
  const opened = await createLedger({
    clock: options.clock ?? createSystemClock(),
    directory: journal,
  });
  if (isErr(opened)) {
    return {
      exitCode: 1,
      message: `${journal}: line ${opened.error.line} has an unrecognized ledger shape.`,
    };
  }
  const ledger = opened.value;
  try {
    if (verified !== undefined) {
      const used = delegatedReceipt(ledger.projection(), verified.key);
      if (
        used !== undefined &&
        !(
          used.action === "publish" &&
          used.target.graph === graph &&
          used.derivation.contentHash === graphHash
        )
      ) {
        return {
          exitCode: 1,
          message: `interlock plan publish: this cite already authorized ${used.action} for ${used.target.graph}.`,
        };
      }
    }
    const node: Node = { graph, id: NODE_ID };
    const source = publicationDerivation(
      by,
      forFlag.kind === "value" ? forFlag.value : undefined,
      verified,
      readingFlag.kind === "value" ? readingFlag.value : undefined,
      graph,
      graphHash,
    );
    const branch = `plan/${graph}`;
    const pushPayload: PlanPushPayload = {
      kind: "push",
      graph,
      sourceSha: committed.value.sourceSha,
      branch,
      refspec: `${committed.value.sourceSha}:refs/heads/${branch}`,
    };
    const push = await ensureIntent(
      ledger,
      effectId("push", graph, graphHash),
      node,
      repository.value,
      "plan-publish/push",
      pushPayload,
      source,
    );
    if (isErr(push)) return { exitCode: 1, message: push.error };
    if (!isPlanPushPayload(push.value.payload))
      return { exitCode: 1, message: "interlock plan publish: retained push intent is invalid." };
    const pushed = await dispatchPush(
      ledger,
      push.value.intent,
      push.value.payload,
      options.gitHost ?? githubAdapter,
      repository.value,
      repoRoot,
    );
    if (isErr(pushed)) return { exitCode: 1, message: pushed.error };

    const citeLine =
      verified === undefined ? "Cite: owner command" : `Cite: ${verified.cite.literal}`;
    const body = [
      `Arc: ${arc.value.id} (${arc.value.source})`,
      "",
      `Ask: ${graphDocument.value.ask ?? arc.value.ask}`,
      citeLine,
      "",
      "Attribution:",
      `Owner: ${forFlag.kind === "value" ? forFlag.value : by}`,
      `Driver: ${by}`,
      ...(readingFlag.kind === "value" ? [`Reading: ${readingFlag.value}`] : []),
      "",
    ].join("\n");
    const pullPayload: PullRequestPayload = {
      kind: "pull-request",
      graph,
      branch,
      base: "main",
      title: `Plan ${graph}`,
      body,
    };
    const pull = await ensureIntent(
      ledger,
      effectId("pull-request", graph, graphHash),
      node,
      repository.value,
      "plan-publish/pull-request",
      pullPayload,
      source,
    );
    if (isErr(pull)) return { exitCode: 1, message: pull.error };
    if (!isPullRequestPayload(pull.value.payload))
      return {
        exitCode: 1,
        message: "interlock plan publish: retained pull-request intent is invalid.",
      };
    const pullRequest = await dispatchPullRequest(
      ledger,
      pull.value.intent,
      pull.value.payload,
      options.gitHost ?? githubAdapter,
      repository.value,
      repoRoot,
    );
    if (isErr(pullRequest)) return { exitCode: 1, message: pullRequest.error };
    const reconciliation = hasExistingPublication(ledger, graph, graphHash)
      ? "reconciled"
      : "published";
    return {
      exitCode: 0,
      message: `${graph}: plan ${reconciliation}; branch ${branch}; pull request ${pullRequest.value.key}.`,
    };
  } finally {
    await ledger.close();
  }
}

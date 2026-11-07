import { err, ok, type Result } from "@phyxiusjs/fp";
import type { OutboxRepository } from "ledger";
import { runProviderCommand } from "runner";

export interface GitHubCommentCite {
  readonly literal: string;
  readonly owner: string;
  readonly repository: string;
  readonly kind: "issues" | "pull";
  readonly number: string;
  readonly commentId: string;
}

export interface VerifiedGitHostComment {
  readonly key: string;
  readonly author: string;
  readonly words: string;
  readonly at: string;
}

export interface PlanPushRequest {
  readonly cwd: string;
  readonly repository: OutboxRepository;
  readonly branch: string;
  readonly refspec: string;
}

export interface PullRequestQuery {
  readonly cwd: string;
  readonly repository: OutboxRepository;
  readonly branch: string;
  readonly base: string;
}

export interface PullRequestRequest extends PullRequestQuery {
  readonly title: string;
  readonly body: string;
}

export interface GitHostPullRequest {
  readonly key: string;
  readonly url?: string;
}

export interface GitHostAdapter {
  verifyComment(
    cite: GitHubCommentCite,
    cwd: string,
  ): Promise<Result<VerifiedGitHostComment, string>>;
  pushPlanBranch?(request: PlanPushRequest): Promise<Result<{ readonly refspec: string }, string>>;
  findPullRequest?(
    request: PullRequestQuery,
  ): Promise<Result<GitHostPullRequest | undefined, string>>;
  openPullRequest?(request: PullRequestRequest): Promise<Result<GitHostPullRequest, string>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function prop(value: Record<string, unknown>, key: string): unknown {
  return value[key];
}

function repositoryName(repository: OutboxRepository): string {
  return `${repository.owner}/${repository.name}`;
}

function firstLine(value: string): string {
  return value.split(/\r?\n/)[0] ?? value;
}

function parsePullRequests(value: unknown): readonly GitHostPullRequest[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: GitHostPullRequest[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return undefined;
    const nodeId = prop(entry, "node_id");
    const number = prop(entry, "number");
    const url = prop(entry, "url");
    if (typeof nodeId !== "string" || (typeof number !== "number" && typeof number !== "string")) {
      return undefined;
    }
    result.push({
      key: `pull:${nodeId}`,
      ...(typeof url === "string" ? { url } : {}),
    });
  }
  return result;
}

async function findPullRequest(
  request: PullRequestQuery,
): Promise<Result<GitHostPullRequest | undefined, string>> {
  const result = await runProviderCommand(
    [
      "gh",
      "pr",
      "list",
      "--repo",
      repositoryName(request.repository),
      "--head",
      request.branch,
      "--base",
      request.base,
      "--state",
      "open",
      "--json",
      "number,url,node_id",
    ],
    request.cwd,
  );
  if (result.code !== 0) return err(firstLine(result.output));
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return err("git-host pull-request lookup did not return JSON");
  }
  const requests = parsePullRequests(parsed);
  if (requests === undefined) return err("git-host pull-request lookup returned malformed JSON");
  return ok(requests[0]);
}

function defaultGitHostAdapter(): GitHostAdapter {
  return {
    async verifyComment(cite, cwd) {
      const query =
        "query($url:URI!){resource(url:$url){... on IssueComment{id author{login} body createdAt}}}";
      const result = await runProviderCommand(
        ["gh", "api", "graphql", "-f", `query=${query}`, "-f", `url=${cite.literal}`],
        cwd,
      );
      if (result.code !== 0) {
        return err(result.output.split(/\r?\n/)[0] ?? "git-host comment lookup failed");
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(result.stdout);
      } catch {
        return err("git-host comment lookup did not return JSON");
      }
      if (!isRecord(parsed)) return err("git-host comment lookup returned no comment");
      const data = prop(parsed, "data");
      const resource = isRecord(data) ? prop(data, "resource") : undefined;
      const author = isRecord(resource) ? prop(resource, "author") : undefined;
      const key = isRecord(resource) ? prop(resource, "id") : undefined;
      const words = isRecord(resource) ? prop(resource, "body") : undefined;
      const at = isRecord(resource) ? prop(resource, "createdAt") : undefined;
      const login = isRecord(author) ? prop(author, "login") : undefined;
      if (
        typeof key !== "string" ||
        typeof login !== "string" ||
        typeof words !== "string" ||
        typeof at !== "string"
      ) {
        return err("git-host comment lookup returned an incomplete comment");
      }
      return ok({ key: `comment:${key}`, author: login, words, at });
    },
    async pushPlanBranch(request) {
      const result = await runProviderCommand(
        ["git", "push", "origin", request.refspec],
        request.cwd,
      );
      return result.code === 0
        ? ok({ refspec: request.refspec })
        : err(firstLine(result.output) || "git push failed");
    },
    findPullRequest,
    async openPullRequest(request) {
      const result = await runProviderCommand(
        [
          "gh",
          "pr",
          "create",
          "--repo",
          repositoryName(request.repository),
          "--base",
          request.base,
          "--head",
          request.branch,
          "--title",
          request.title,
          "--body",
          request.body,
        ],
        request.cwd,
      );
      if (result.code !== 0)
        return err(firstLine(result.output) || "git-host pull-request creation failed");
      const url = firstLine(result.stdout).trim();
      return url.length > 0
        ? ok({ key: `pull:${url}`, url })
        : err("git-host pull-request creation returned no URL");
    },
  };
}

export const githubAdapter = defaultGitHostAdapter();

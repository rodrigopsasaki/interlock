import { err, ok, type Result } from "@phyxiusjs/fp";
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

export interface GitHostAdapter {
  verifyComment(
    cite: GitHubCommentCite,
    cwd: string,
  ): Promise<Result<VerifiedGitHostComment, string>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function prop(value: Record<string, unknown>, key: string): unknown {
  return value[key];
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
  };
}

export const githubAdapter = defaultGitHostAdapter();

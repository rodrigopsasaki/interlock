import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { err, ok } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import { fixtureGit } from "../../../test/support/gitFixture.ts";
import type {
  GitHostAdapter,
  GitHostPullRequest,
  PlanPushRequest,
  PullRequestQuery,
  PullRequestRequest,
} from "../src/gitHostAdapter.ts";
import { runPlanPublish } from "../src/planPublish.ts";
import { commitAll, commitPath, gitInitFixture } from "./graph/gitFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

const graphId = "0058-cited-delegation";
const arcYaml = [
  "interlock: arcs@v0",
  "arcs:",
  "  - id: every-ask-is-an-arc",
  "    title: Every ask is an arc",
  '    ask: "an arc ask"',
  "    source: project chat",
  `    graphs: [interlock/${graphId}]`,
  "",
].join("\n");

function graphYaml(arc: string | undefined): string {
  return [
    "interlock: graph@v0",
    `id: ${graphId}`,
    ...(arc === undefined ? [] : [`arc: ${arc}`]),
    "ask: publish this plan",
    "nodes:",
    "  - id: work",
    "    depends_on: []",
    "    gates: []",
    "",
  ].join("\n");
}

interface FixtureHost extends GitHostAdapter {
  readonly pushes: PlanPushRequest[];
  readonly finds: PullRequestQuery[];
  readonly opens: PullRequestRequest[];
  readonly setPullRequest: (value: GitHostPullRequest | undefined) => void;
  readonly failOpen: () => void;
}

function host(): FixtureHost {
  const pushes: PlanPushRequest[] = [];
  const finds: PullRequestQuery[] = [];
  const opens: PullRequestRequest[] = [];
  let pullRequest: GitHostPullRequest | undefined;
  let openFails = false;
  return {
    pushes,
    finds,
    opens,
    setPullRequest(value) {
      pullRequest = value;
    },
    failOpen() {
      openFails = true;
    },
    verifyComment: async () => err("not used"),
    pushPlanBranch: async (request) => {
      pushes.push(request);
      return ok({ refspec: request.refspec });
    },
    findPullRequest: async (request) => {
      finds.push(request);
      return ok(pullRequest);
    },
    openPullRequest: async (request) => {
      opens.push(request);
      if (openFails) return err("fixture pull-request interruption");
      const created = { key: "pull:fixture-1", url: "https://forge.invalid/pull/1" };
      pullRequest = created;
      return ok(created);
    },
  };
}

function fixture(
  options: {
    readonly graph?: string;
    readonly arc?: string;
    readonly untrackedGraph?: boolean;
  } = {},
): string {
  directory = mkdtempSync(join(runsRoot, "plan-publish-"));
  gitInitFixture(directory);
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  writeFileSync(
    join(directory, ".interlock", "graphs", `${graphId}.yaml`),
    options.graph ?? graphYaml(options.arc ?? "every-ask-is-an-arc"),
  );
  writeFileSync(join(directory, ".interlock", "arcs.yaml"), arcYaml);
  fixtureGit(["remote", "add", "origin", "https://github.com/acme/widgets.git"], {
    cwd: directory,
  });
  if (options.untrackedGraph === true)
    commitPath(directory, ".interlock/arcs.yaml", "add arc registry");
  else commitAll(directory, "add drafted plan");
  return directory;
}

function commandArgs(): readonly string[] {
  return [graphId, "--by", "Rodrigo Sasaki"];
}

function clock() {
  return createControlledClock({ initialTime: 0 });
}

describe("plan publish", () => {
  it("pushes the literal plan refspec and opens one pull request", async () => {
    const cwd = fixture();
    const adapter = host();
    const result = await runPlanPublish(commandArgs(), { cwd, clock: clock(), gitHost: adapter });

    expect(result.exitCode).toBe(0);
    expect(adapter.pushes).toHaveLength(1);
    expect(adapter.pushes[0]?.refspec).toMatch(
      /^[0-9a-f]{40}:refs\/heads\/plan\/0058-cited-delegation$/,
    );
    expect(adapter.opens).toHaveLength(1);
    expect(adapter.opens[0]?.body.startsWith("Arc: every-ask-is-an-arc (project chat)")).toBe(true);
  });

  it("publishes twice without another push or pull request", async () => {
    const cwd = fixture();
    const adapter = host();
    expect(
      (await runPlanPublish(commandArgs(), { cwd, clock: clock(), gitHost: adapter })).exitCode,
    ).toBe(0);
    expect(
      (await runPlanPublish(commandArgs(), { cwd, clock: clock(), gitHost: adapter })).exitCode,
    ).toBe(0);

    expect(adapter.pushes).toHaveLength(1);
    expect(adapter.opens).toHaveLength(1);
  });

  it("reconciles an interrupted pull-request open", async () => {
    const cwd = fixture();
    const adapter = host();
    adapter.failOpen();
    expect(
      (await runPlanPublish(commandArgs(), { cwd, clock: clock(), gitHost: adapter })).exitCode,
    ).not.toBe(0);

    adapter.setPullRequest({ key: "pull:recovered", url: "https://forge.invalid/pull/1" });
    expect(
      (await runPlanPublish(commandArgs(), { cwd, clock: clock(), gitHost: adapter })).exitCode,
    ).toBe(0);
    expect(adapter.pushes).toHaveLength(1);
    expect(adapter.opens).toHaveLength(1);
    expect(adapter.finds).toHaveLength(2);
  });

  it("re-sends the persisted source sha after the branch tip moves", async () => {
    const cwd = fixture();
    const adapter = host();
    adapter.pushPlanBranch = async (request) => {
      adapter.pushes.push(request);
      return err("fixture push interruption");
    };
    expect(
      (await runPlanPublish(commandArgs(), { cwd, clock: clock(), gitHost: adapter })).exitCode,
    ).not.toBe(0);
    const firstSha = adapter.pushes[0]?.refspec.split(":")[0];
    writeFileSync(join(cwd, "unrelated.txt"), "unrelated\n");
    commitAll(cwd, "move branch tip");

    adapter.pushPlanBranch = async (request) => {
      adapter.pushes.push(request);
      return ok({ refspec: request.refspec });
    };
    adapter.setPullRequest({ key: "pull:recovered", url: "https://forge.invalid/pull/1" });
    expect(
      (await runPlanPublish(commandArgs(), { cwd, clock: clock(), gitHost: adapter })).exitCode,
    ).toBe(0);
    expect(adapter.pushes[1]?.refspec.split(":")[0]).toBe(firstSha);
  });

  it.each([
    ["missing arc", graphYaml(undefined), "has no arc"],
    ["unknown arc", graphYaml("not-registered"), 'arc "not-registered"'],
  ])("refuses a graph with %s before effects", async (_name, graph, message) => {
    const cwd = fixture({ graph });
    const adapter = host();
    const result = await runPlanPublish(commandArgs(), { cwd, clock: clock(), gitHost: adapter });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain(message);
    expect(adapter.pushes).toHaveLength(0);
    expect(adapter.opens).toHaveLength(0);
  });

  it("refuses a hostile graph id before any push", async () => {
    const cwd = fixture();
    const adapter = host();
    const result = await runPlanPublish(["x:refs/heads/main", "--by", "Rodrigo Sasaki"], {
      cwd,
      clock: clock(),
      gitHost: adapter,
    });
    expect(result.exitCode).not.toBe(0);
    expect(adapter.pushes).toHaveLength(0);
  });

  it("refuses an untracked graph and a worktree graph changed after commit", async () => {
    const untracked = fixture({ untrackedGraph: true });
    const untrackedHost = host();
    const untrackedResult = await runPlanPublish(commandArgs(), {
      cwd: untracked,
      clock: clock(),
      gitHost: untrackedHost,
    });
    expect(untrackedResult.exitCode).not.toBe(0);
    expect(untrackedResult.message).toContain("untracked");
    expect(untrackedHost.pushes).toHaveLength(0);

    const changed = fixture();
    writeFileSync(
      join(changed, ".interlock", "graphs", `${graphId}.yaml`),
      `${graphYaml("every-ask-is-an-arc")}# changed\n`,
    );
    const changedHost = host();
    const changedResult = await runPlanPublish(commandArgs(), {
      cwd: changed,
      clock: clock(),
      gitHost: changedHost,
    });
    expect(changedResult.exitCode).not.toBe(0);
    expect(changedResult.message).toContain("differs");
    expect(changedHost.pushes).toHaveLength(0);
    expect(existsSync(join(changed, ".interlock", "ledger", "journal.jsonl"))).toBe(false);
  });

  it("applies the cited owner rule before recording an effect", async () => {
    const cwd = fixture();
    const adapter = host();
    const result = await runPlanPublish(
      [
        ...commandArgs(),
        "--for",
        "Rodrigo Sasaki",
        "--cites",
        "said:missing",
        "--reading",
        "publish this plan",
      ],
      { cwd, clock: clock(), gitHost: adapter, machinePath: join(cwd, "missing-machine.yaml") },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("machine provider");
    expect(adapter.pushes).toHaveLength(0);
  });
});

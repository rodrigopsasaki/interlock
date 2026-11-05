import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { createControlledClock, deadlineFrom, ms } from "@phyxiusjs/clock";
import { err, isErr, ok } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import { claudeLiveWork, liveWorkOfTranscript } from "../src/claude/liveWork.ts";
import { createHerdrRuntime } from "../src/herdr/adapter.ts";
import type {
  Agent,
  AgentObservation,
  AgentStatus,
  LiveWork,
  Runtime,
  RuntimeRefusal,
} from "../src/runtime.ts";
import { type UnfinishedWork, waitForSession } from "../src/sessionWait.ts";
import { type FakeHerdrServer, startFakeHerdrServer } from "./herdr/fakeServer.ts";

const PROJECTS = join(import.meta.dirname, "fixtures", "claude");
const runsRoot = join(import.meta.dirname, ".runs");

function transcript(name: string): string {
  return readFileSync(join(PROJECTS, "repo-worktrees-node", `${name}.jsonl`), "utf-8");
}

const agent: Agent = { id: "agent-1", pane: { id: "pane-1" } };

const NONE: LiveWork = { state: "none" };
const SUBAGENT: LiveWork = {
  state: "live",
  because: "background Agent call toolu_bg has not finished",
};
const UNOBSERVED: LiveWork = { state: "unknown", because: "the runtime's observation failed" };

function observed(work: LiveWork, agentStatus: AgentStatus = "idle"): AgentObservation {
  return {
    agentStatus,
    pane: { state: "known", address: "pane-1" },
    liveWork: () => Promise.resolve(work),
  };
}

function observations(sequence: readonly LiveWork[]) {
  const seen: LiveWork[] = [];
  const observe = (): Promise<AgentObservation> => {
    const work = sequence[Math.min(seen.length, sequence.length - 1)] ?? NONE;
    seen.push(work);
    return Promise.resolve(observed(work));
  };
  return { observe, seen };
}

type WaitStep = AgentStatus | "elapse";

function scriptedRuntime(
  clock: ReturnType<typeof createControlledClock>,
  script: WaitStep[],
): Runtime & { readonly asked: (readonly AgentStatus[])[] } {
  const asked: (readonly AgentStatus[])[] = [];
  return {
    asked,
    openPane: () => Promise.resolve(ok({ id: "pane-1" })),
    startAgent: (pane) => Promise.resolve(ok({ id: "agent-1", pane })),
    reportIdentity: () => Promise.resolve(ok(undefined)),
    prompt: () => Promise.resolve(ok(undefined)),
    waitUntil: (_agent, until, timeoutMs) => {
      asked.push(until);
      const next = script.shift() ?? "elapse";
      if (next !== "elapse") return Promise.resolve(ok(next));
      clock.advanceBy(ms(timeoutMs));
      const refusal: RuntimeRefusal = { kind: "timeout", until, timeoutMs, status: "idle" };
      return Promise.resolve(err(refusal));
    },
    read: () => Promise.resolve(ok("")),
    sendKeys: () => Promise.resolve(ok(undefined)),
    sendPaneKeys: () => Promise.resolve(ok(undefined)),
    closePane: () => Promise.resolve(ok(undefined)),
  };
}

const CLEAN = (): UnfinishedWork | undefined => undefined;
const DIRTY = (): UnfinishedWork | undefined => ({ uncommittedPaths: 2, debriefMissing: false });

describe("the Claude adapter's live-work evidence, read from the runtime's own transcript", () => {
  it.each([
    ["an ordinary completed attempt", "completed", NONE],
    [
      "a tool call still running in the foreground",
      "tool-in-flight",
      { state: "live", because: "Bash call toolu_long has no result" },
    ],
    [
      "a foreground subagent with no result yet",
      "subagent-in-flight",
      { state: "live", because: "Agent call toolu_fg has no result" },
    ],
    [
      "a background subagent the runtime has not reported finished",
      "subagent-background",
      SUBAGENT,
    ],
    ["a background subagent the runtime reported completed", "subagent-finished", NONE],
    [
      "a background subagent the runtime reported still running",
      "subagent-reported-running",
      SUBAGENT,
    ],
    [
      "a background shell with no completion",
      "shell-background",
      { state: "live", because: "background Bash call toolu_sh has not finished" },
    ],
    ["a background shell the runtime reported failed", "shell-finished", NONE],
    [
      "an agent that says, and echoes from a tool, that its subagent is done",
      "subagent-claimed-done",
      SUBAGENT,
    ],
    [
      "a transcript whose last line is still being written",
      "incomplete",
      { state: "unknown", because: "the transcript's last line is incomplete" },
    ],
    [
      "a transcript with an unparseable line",
      "unparseable",
      { state: "unknown", because: "transcript line 2 does not parse" },
    ],
    ["an empty transcript", "empty", { state: "unknown", because: "the transcript is empty" }],
  ])("reads %s", (_name, fixture, expected) => {
    expect(liveWorkOfTranscript(transcript(fixture))).toEqual(expected);
  });

  it("finds the transcript by the runtime's session id, and reads unknown when there is none", async () => {
    expect(await claudeLiveWork("completed", PROJECTS)).toEqual(NONE);
    expect(await claudeLiveWork("subagent-background", PROJECTS)).toEqual(SUBAGENT);
    expect(await claudeLiveWork("never-written", PROJECTS)).toEqual({
      state: "unknown",
      because: "no transcript for session never-written",
    });
    expect((await claudeLiveWork("../escape", PROJECTS)).state).toBe("unknown");
    expect((await claudeLiveWork("completed", join(PROJECTS, "absent"))).state).toBe("unknown");
  });
});

describe("the herdr adapter's observation carries each attempt's live work", () => {
  let herdr: FakeHerdrServer | undefined;
  let directory: string | undefined;

  afterEach(async () => {
    await herdr?.close();
    herdr = undefined;
    if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
    directory = undefined;
  });

  it("resolves live work through the agent's runtime session, and unknown wherever it cannot", async () => {
    mkdirSync(runsRoot, { recursive: true });
    directory = mkdtempSync(join(runsRoot, "sock-"));
    herdr = await startFakeHerdrServer(
      relative(process.cwd(), join(directory, `${randomUUID().slice(0, 8)}.sock`)),
    );
    const session = (agent: string, value: string) => ({
      source: `herdr:${agent}`,
      agent,
      kind: "id",
      value,
    });
    herdr.panes = [
      {
        pane_id: "p1",
        agent_status: "idle",
        tokens: { graph: "g", node: "done", session: "s1" },
        agent_session: session("claude", "completed"),
      },
      {
        pane_id: "p2",
        agent_status: "done",
        tokens: { graph: "g", node: "busy", session: "s2" },
        agent_session: session("claude", "subagent-background"),
      },
      {
        pane_id: "p3",
        agent_status: "idle",
        tokens: { graph: "g", node: "other", session: "s3" },
        agent_session: session("codex", "thread-1"),
      },
      { pane_id: "p4", agent_status: "idle", tokens: { graph: "g", node: "bare", session: "s4" } },
    ];
    const created = await createHerdrRuntime(herdr.socketPath, undefined, undefined, undefined, {
      claude: (id) => claudeLiveWork(id, PROJECTS),
    });
    if (isErr(created) || created.value.observe === undefined) {
      throw new Error("expected a herdr runtime that observes");
    }
    const observation = await created.value.observe();
    if (isErr(observation)) throw new Error("expected an observation");
    const workOf = (node: string, session: string) =>
      observation.value.attempt({ graph: "g", node, session }).liveWork();

    expect(await workOf("done", "s1")).toEqual(NONE);
    expect(await workOf("busy", "s2")).toEqual(SUBAGENT);
    expect(await workOf("other", "s3")).toEqual({
      state: "unknown",
      because: "no live-work evidence source for agent runtime codex",
    });
    expect(await workOf("bare", "s4")).toEqual({
      state: "unknown",
      because: "the runtime reports no agent session to read live work from",
    });
    expect(await workOf("gone", "s9")).toEqual({
      state: "unknown",
      because: "the runtime lists no agent for session s9",
    });
    expect(herdr.calls.map((call) => call.method)).toEqual(["agent.list"]);
  });

  it("refuses an observation herdr cannot give, so it reads unknown rather than none", async () => {
    mkdirSync(runsRoot, { recursive: true });
    directory = mkdtempSync(join(runsRoot, "sock-"));
    herdr = await startFakeHerdrServer(
      relative(process.cwd(), join(directory, `${randomUUID().slice(0, 8)}.sock`)),
    );
    herdr.failNextCall("unavailable", "agent.list is unavailable");
    const created = await createHerdrRuntime(herdr.socketPath);
    if (isErr(created) || created.value.observe === undefined) {
      throw new Error("expected a herdr runtime that observes");
    }
    expect(isErr(await created.value.observe())).toBe(true);
  });
});

describe("settled means no live work", () => {
  it("does not judge a clean worktree while a subagent runs, and judges once the child completes with the parent still idle", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const runtime = scriptedRuntime(clock, ["idle"]);
    const { observe, seen } = observations([SUBAGENT, SUBAGENT, NONE]);
    const lines: string[] = [];

    const result = await waitForSession(
      runtime,
      agent,
      observe,
      clock,
      deadlineFrom(clock.now().monoMs, ms(600_000)),
      600_000,
      30_000,
      (line) => lines.push(line),
      CLEAN,
      undefined,
      { observeEveryMs: 5_000 },
    );

    expect(result).toEqual({ _tag: "Ok", value: "idle" });
    expect(seen).toEqual([SUBAGENT, SUBAGENT, NONE]);
    expect(clock.now().monoMs).toBe(10_000);
    expect(runtime.asked.slice(1)).toEqual([
      ["working", "blocked"],
      ["working", "blocked"],
    ]);
    expect(lines).toEqual([
      "agent idle but its work is not shown finished (live: background Agent call toolu_bg has not finished); observing again",
    ]);
  });

  it("keeps observing past grace expiry while work is live, and judges only when it ends", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const runtime = scriptedRuntime(clock, ["done"]);
    const { observe, seen } = observations([SUBAGENT, SUBAGENT, SUBAGENT, NONE]);
    const lines: string[] = [];

    const result = await waitForSession(
      runtime,
      agent,
      observe,
      clock,
      deadlineFrom(clock.now().monoMs, ms(600_000)),
      600_000,
      30_000,
      (line) => lines.push(line),
      DIRTY,
      undefined,
      { observeEveryMs: 5_000 },
    );

    expect(result).toEqual({ _tag: "Ok", value: "done" });
    expect(seen).toHaveLength(4);
    expect(clock.now().monoMs).toBe(30_000 + 15_000);
    expect(lines[0]).toBe(
      "agent settled with 2 uncommitted paths; judging in 30s unless it resumes",
    );
  });

  const graceTable: readonly (readonly [AgentStatus, typeof CLEAN, number])[] = [
    ["idle", CLEAN, 0],
    ["done", CLEAN, 0],
    ["idle", DIRTY, 30_000],
    ["done", DIRTY, 30_000],
  ];

  it.each(graceTable)(
    "settles %s with none exactly as before (grace %#)",
    async (status, unfinished, waitedMs) => {
      const clock = createControlledClock({ initialTime: 0 });
      const runtime = scriptedRuntime(clock, [status]);
      const { observe, seen } = observations([NONE]);

      const result = await waitForSession(
        runtime,
        agent,
        observe,
        clock,
        deadlineFrom(clock.now().monoMs, ms(600_000)),
        600_000,
        30_000,
        () => {},
        unfinished,
      );

      expect(result).toEqual({ _tag: "Ok", value: status });
      expect(seen).toEqual([NONE]);
      expect(clock.now().monoMs).toBe(waitedMs);
    },
  );

  it("keeps the person's-turn grace before it observes, and resumes clear both", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const runtime = scriptedRuntime(clock, [
      "blocked",
      "idle",
      "elapse",
      "elapse",
      "working",
      "idle",
    ]);
    const { observe, seen } = observations([SUBAGENT, NONE]);

    const result = await waitForSession(
      runtime,
      agent,
      observe,
      clock,
      deadlineFrom(clock.now().monoMs, ms(600_000)),
      600_000,
      30_000,
      () => {},
      CLEAN,
      undefined,
      { observeEveryMs: 5_000 },
    );

    expect(isErr(result)).toBe(false);
    expect(seen).toEqual([SUBAGENT, NONE]);
  });

  it.each([
    ["with a clean worktree", CLEAN],
    ["through the unfinished-work grace", DIRTY],
  ])(
    "never settles unknown %s; at the run deadline it refuses with a timeout and judges nothing",
    async (_name, unfinished) => {
      const clock = createControlledClock({ initialTime: 0 });
      const runtime = scriptedRuntime(clock, ["idle"]);
      const { observe, seen } = observations([UNOBSERVED]);

      const result = await waitForSession(
        runtime,
        agent,
        observe,
        clock,
        deadlineFrom(clock.now().monoMs, ms(120_000)),
        120_000,
        30_000,
        () => {},
        unfinished,
        undefined,
        { observeEveryMs: 5_000 },
      );

      expect(result).toEqual({
        _tag: "Err",
        error: {
          kind: "timeout",
          until: ["working", "blocked"],
          timeoutMs: 120_000,
          status: "idle",
          liveWork: UNOBSERVED,
        },
      });
      expect(clock.now().monoMs).toBe(120_000);
      expect(seen.every((work) => work.state === "unknown")).toBe(true);
    },
  );

  it("does not settle unknown when the person's-turn grace runs into the run deadline", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const runtime = scriptedRuntime(clock, ["blocked", "done"]);
    const { observe } = observations([UNOBSERVED]);

    const result = await waitForSession(
      runtime,
      agent,
      observe,
      clock,
      deadlineFrom(clock.now().monoMs, ms(10_000)),
      10_000,
      300_000,
      () => {},
      CLEAN,
    );

    expect(isErr(result) && result.error.kind === "timeout" ? result.error.liveWork : NONE).toEqual(
      UNOBSERVED,
    );
  });

  it("holds an abandoned prompt delivery to the same rule: live work keeps it from judging", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const runtime = scriptedRuntime(clock, []);
    const { observe, seen } = observations([
      { state: "live", because: "Bash call toolu_long has no result" },
      NONE,
    ]);

    const result = await waitForSession(
      runtime,
      agent,
      observe,
      clock,
      deadlineFrom(clock.now().monoMs, ms(600_000)),
      600_000,
      30_000,
      () => {},
      CLEAN,
      undefined,
      { alreadySettled: "idle", observeEveryMs: 5_000 },
    );

    expect(result).toEqual({ _tag: "Ok", value: "idle" });
    expect(seen).toHaveLength(2);
  });

  it("refuses an abandoned delivery at the deadline when its work stays unknown", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const runtime = scriptedRuntime(clock, []);
    const { observe } = observations([UNOBSERVED]);

    const result = await waitForSession(
      runtime,
      agent,
      observe,
      clock,
      deadlineFrom(clock.now().monoMs, ms(20_000)),
      20_000,
      30_000,
      () => {},
      CLEAN,
      undefined,
      { alreadySettled: "idle", observeEveryMs: 5_000 },
    );

    expect(isErr(result) && result.error.kind === "timeout").toBe(true);
  });

  it("does not settle when the fresh observation shows the agent working again", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const runtime = scriptedRuntime(clock, ["idle", "working", "idle"]);
    let calls = 0;
    const observe = (): Promise<AgentObservation> => {
      calls += 1;
      return Promise.resolve(calls === 1 ? observed(NONE, "working") : observed(NONE));
    };

    const result = await waitForSession(
      runtime,
      agent,
      observe,
      clock,
      deadlineFrom(clock.now().monoMs, ms(600_000)),
      600_000,
      30_000,
      () => {},
      CLEAN,
    );

    expect(result).toEqual({ _tag: "Ok", value: "idle" });
    expect(calls).toBe(2);
  });
});

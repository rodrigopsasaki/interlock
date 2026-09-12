import { createControlledClock, deadlineFrom, ms } from "@phyxiusjs/clock";
import { err, isErr, ok } from "@phyxiusjs/fp";
import { describe, expect, it } from "vitest";
import type { Agent, AgentStatus, Runtime } from "../src/runtime.ts";
import { waitForSession } from "../src/sessionWait.ts";

const agent: Agent = { id: "agent-1", pane: { id: "pane-1" } };

function stubRuntime(overrides: Partial<Runtime> = {}): Runtime {
  return {
    openPane: () => Promise.resolve(ok({ id: "pane-1" })),
    startAgent: (pane) => Promise.resolve(ok({ id: "agent-1", pane })),
    reportIdentity: () => Promise.resolve(ok(undefined)),
    prompt: () => Promise.resolve(ok(undefined)),
    waitUntil: () => Promise.resolve(ok("idle")),
    read: () => Promise.resolve(ok("")),
    sendKeys: () => Promise.resolve(ok(undefined)),
    closePane: () => Promise.resolve(ok(undefined)),
    ...overrides,
  };
}

describe("waitForSession", () => {
  it("opens a fresh grace window per settle episode after a person's turn, and resumes clear it", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const graceMs = 5_000;
    const script: AgentStatus[] = ["blocked", "done", "working", "idle"];
    const runtime = stubRuntime({
      waitUntil: (_agent, until, timeoutMs) => {
        const next = script.shift();
        if (next !== undefined) return Promise.resolve(ok(next));
        clock.advanceBy(ms(timeoutMs));
        return Promise.resolve(err({ kind: "timeout", until, timeoutMs, status: "idle" }));
      },
      read: () => Promise.resolve(ok("")),
    });
    const lines: string[] = [];

    const deadline = deadlineFrom(clock.now().monoMs, ms(600_000));
    const result = await waitForSession(
      runtime,
      agent,
      clock,
      deadline,
      600_000,
      graceMs,
      (line) => lines.push(line),
      () => undefined,
    );

    expect(result).toEqual({ _tag: "Ok", value: "idle" });
    expect(lines).toEqual([
      "agent blocked; answer in pane pane-1: (no output)",
      "agent settled after a person's turn; judging in 5s unless it resumes",
      "agent working",
      "agent settled after a person's turn; judging in 5s unless it resumes",
    ]);
  });

  it("arms the after-a-person's-turn window once per episode; a settled status repeated inside it does not narrate or re-arm", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const graceMs = 5_000;
    const script: AgentStatus[] = ["blocked", "done", "idle"];
    const runtime = stubRuntime({
      waitUntil: (_agent, until, timeoutMs) => {
        const next = script.shift();
        if (next !== undefined) return Promise.resolve(ok(next));
        clock.advanceBy(ms(timeoutMs));
        return Promise.resolve(err({ kind: "timeout", until, timeoutMs, status: "idle" }));
      },
      read: () => Promise.resolve(ok("")),
    });
    const lines: string[] = [];

    const deadline = deadlineFrom(clock.now().monoMs, ms(600_000));
    const result = await waitForSession(
      runtime,
      agent,
      clock,
      deadline,
      600_000,
      graceMs,
      (line) => lines.push(line),
      () => undefined,
    );

    expect(result).toEqual({ _tag: "Ok", value: "done" });
    expect(lines).toEqual([
      "agent blocked; answer in pane pane-1: (no output)",
      "agent settled after a person's turn; judging in 5s unless it resumes",
    ]);
  });

  it("arms the unfinished-work window once per episode; a settled status repeated inside it does not narrate, re-arm or re-check the worktree", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const graceMs = 5_000;
    const script: AgentStatus[] = ["done", "idle"];
    const runtime = stubRuntime({
      waitUntil: (_agent, until, timeoutMs) => {
        const next = script.shift();
        if (next !== undefined) return Promise.resolve(ok(next));
        clock.advanceBy(ms(timeoutMs));
        return Promise.resolve(err({ kind: "timeout", until, timeoutMs, status: "idle" }));
      },
    });
    const lines: string[] = [];
    let unfinishedCalls = 0;

    const deadline = deadlineFrom(clock.now().monoMs, ms(600_000));
    const result = await waitForSession(
      runtime,
      agent,
      clock,
      deadline,
      600_000,
      graceMs,
      (line) => lines.push(line),
      () => {
        unfinishedCalls += 1;
        return { uncommittedPaths: 1, debriefMissing: true };
      },
    );

    expect(result).toEqual({ _tag: "Ok", value: "done" });
    expect(lines).toEqual([
      "agent settled with 1 uncommitted path and no debrief; judging in 5s unless it resumes",
    ]);
    expect(unfinishedCalls).toBe(1);
  });

  it("narrates a screen-read failure inline rather than losing the blocked turn", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const script: AgentStatus[] = ["blocked", "idle"];
    const runtime = stubRuntime({
      waitUntil: (_agent, until, timeoutMs) => {
        const next = script.shift();
        if (next !== undefined) return Promise.resolve(ok(next));
        clock.advanceBy(ms(timeoutMs));
        return Promise.resolve(err({ kind: "timeout", until, timeoutMs, status: "idle" }));
      },
      read: () => Promise.resolve(err({ kind: "transport", because: "the pane vanished" })),
    });
    const lines: string[] = [];

    const deadline = deadlineFrom(clock.now().monoMs, ms(60_000));
    const result = await waitForSession(
      runtime,
      agent,
      clock,
      deadline,
      60_000,
      5_000,
      (line) => lines.push(line),
      () => undefined,
    );

    expect(result).toEqual({ _tag: "Ok", value: "idle" });
    expect(lines).toEqual([
      "agent blocked; answer in pane pane-1: (screen unreadable: the pane vanished)",
      "agent settled after a person's turn; judging in 5s unless it resumes",
    ]);
  });

  it("does not settle on done until the grace window actually elapses", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const graceMs = 120_000;
    const requestedWaits: number[] = [];
    const script: AgentStatus[] = ["blocked", "done"];
    const runtime = stubRuntime({
      waitUntil: (_agent, until, timeoutMs) => {
        requestedWaits.push(timeoutMs);
        const next = script.shift();
        if (next !== undefined) return Promise.resolve(ok(next));
        clock.advanceBy(ms(timeoutMs));
        return Promise.resolve(err({ kind: "timeout", until, timeoutMs, status: "done" }));
      },
      read: () => Promise.resolve(ok("")),
    });

    const deadline = deadlineFrom(clock.now().monoMs, ms(3_600_000));
    const result = await waitForSession(
      runtime,
      agent,
      clock,
      deadline,
      3_600_000,
      graceMs,
      () => {},
      () => undefined,
    );

    expect(result).toEqual({ _tag: "Ok", value: "done" });
    expect(requestedWaits[2]).toBe(graceMs);
    expect(clock.now().monoMs).toBe(graceMs);
  });

  it("returns idle at once when no blocked turn preceded it", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const runtime = stubRuntime({
      waitUntil: () => Promise.resolve(ok("idle")),
    });
    const lines: string[] = [];

    const deadline = deadlineFrom(clock.now().monoMs, ms(60_000));
    const result = await waitForSession(
      runtime,
      agent,
      clock,
      deadline,
      60_000,
      300_000,
      (line) => lines.push(line),
      () => undefined,
    );

    expect(result).toEqual({ _tag: "Ok", value: "idle" });
    expect(lines).toEqual([]);
  });

  it("caps the grace window at the run's own deadline", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const runTimeoutMs = 10_000;
    const graceMs = 300_000;
    const requestedWaits: number[] = [];
    const script: AgentStatus[] = ["blocked", "done"];
    const runtime = stubRuntime({
      waitUntil: (_agent, until, timeoutMs) => {
        requestedWaits.push(timeoutMs);
        const next = script.shift();
        if (next !== undefined) {
          clock.advanceBy(ms(1_000));
          return Promise.resolve(ok(next));
        }
        clock.advanceBy(ms(timeoutMs));
        return Promise.resolve(err({ kind: "timeout", until, timeoutMs, status: "done" }));
      },
      read: () => Promise.resolve(ok("")),
    });

    const deadline = deadlineFrom(clock.now().monoMs, ms(runTimeoutMs));
    const result = await waitForSession(
      runtime,
      agent,
      clock,
      deadline,
      runTimeoutMs,
      graceMs,
      () => {},
      () => undefined,
    );

    expect(result).toEqual({ _tag: "Ok", value: "done" });
    expect(requestedWaits[2]).toBe(8_000);
    expect(clock.now().monoMs).toBe(runTimeoutMs);
  });

  it("times out against its own deadline while the agent alternates blocked and working forever", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const stepMs = ms(1_000);
    let blocked = true;
    const runtime = stubRuntime({
      waitUntil: (_agent, until) => {
        clock.advanceBy(stepMs);
        const status: AgentStatus = blocked ? "blocked" : "working";
        blocked = !blocked;
        return Promise.resolve(
          until.includes(status)
            ? ok(status)
            : err({ kind: "timeout", until, timeoutMs: stepMs, status }),
        );
      },
      read: () => Promise.resolve(ok("waiting on a shell command approval")),
    });

    const deadline = deadlineFrom(clock.now().monoMs, ms(3_500));
    const result = await waitForSession(
      runtime,
      agent,
      clock,
      deadline,
      3_500,
      300_000,
      () => {},
      () => undefined,
    );

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe("timeout");
      if (result.error.kind === "timeout") {
        expect(["blocked", "working"]).toContain(result.error.status);
      }
    }
  });

  it("returns a wait refusal as soon as the runtime itself refuses", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const runtime = stubRuntime({
      waitUntil: () => Promise.resolve(err({ kind: "transport", because: "the socket closed" })),
    });

    const deadline = deadlineFrom(clock.now().monoMs, ms(60_000));
    const result = await waitForSession(
      runtime,
      agent,
      clock,
      deadline,
      60_000,
      300_000,
      () => {},
      () => undefined,
    );

    expect(result).toEqual({
      _tag: "Err",
      error: { kind: "transport", because: "the socket closed" },
    });
  });

  it("never calls the runtime once the deadline has already passed", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    let calls = 0;
    const runtime = stubRuntime({
      waitUntil: () => {
        calls += 1;
        return Promise.resolve(ok("idle"));
      },
    });

    const deadline = deadlineFrom(clock.now().monoMs, ms(1_000));
    clock.advanceBy(ms(2_000));

    const result = await waitForSession(
      runtime,
      agent,
      clock,
      deadline,
      1_000,
      300_000,
      () => {},
      () => undefined,
    );

    expect(calls).toBe(0);
    expect(isErr(result)).toBe(true);
    if (isErr(result))
      expect(result.error).toEqual({
        kind: "timeout",
        until: ["idle", "blocked", "done"],
        timeoutMs: 1_000,
        status: "unknown",
      });
  });

  it("unfinished settle then working then finished settle returns after the second settle", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const script: AgentStatus[] = ["done", "working", "idle"];
    const runtime = stubRuntime({
      waitUntil: (_agent, until, timeoutMs) => {
        const next = script.shift();
        if (next !== undefined) return Promise.resolve(ok(next));
        return Promise.resolve(err({ kind: "timeout", until, timeoutMs, status: "idle" }));
      },
    });
    const lines: string[] = [];
    let unfinishedCalls = 0;

    const deadline = deadlineFrom(clock.now().monoMs, ms(600_000));
    const result = await waitForSession(
      runtime,
      agent,
      clock,
      deadline,
      600_000,
      5_000,
      (line) => lines.push(line),
      () => {
        unfinishedCalls += 1;
        return unfinishedCalls === 1 ? { uncommittedPaths: 4, debriefMissing: true } : undefined;
      },
    );

    expect(result).toEqual({ _tag: "Ok", value: "idle" });
    expect(lines).toEqual([
      "agent settled with 4 uncommitted paths and no debrief; judging in 5s unless it resumes",
      "agent working",
    ]);
    expect(unfinishedCalls).toBe(2);
  });

  it("a finished settle (clean tree, committed debrief) judges at once", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const runtime = stubRuntime({
      waitUntil: () => Promise.resolve(ok("done")),
    });
    const lines: string[] = [];

    const deadline = deadlineFrom(clock.now().monoMs, ms(60_000));
    const result = await waitForSession(
      runtime,
      agent,
      clock,
      deadline,
      60_000,
      300_000,
      (line) => lines.push(line),
      () => undefined,
    );

    expect(result).toEqual({ _tag: "Ok", value: "done" });
    expect(lines).toEqual([]);
  });

  it("does not settle on an unfinished done until the grace window actually elapses", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const graceMs = 120_000;
    const requestedWaits: number[] = [];
    const script: AgentStatus[] = ["done"];
    const runtime = stubRuntime({
      waitUntil: (_agent, until, timeoutMs) => {
        requestedWaits.push(timeoutMs);
        const next = script.shift();
        if (next !== undefined) return Promise.resolve(ok(next));
        clock.advanceBy(ms(timeoutMs));
        return Promise.resolve(err({ kind: "timeout", until, timeoutMs, status: "done" }));
      },
    });

    const deadline = deadlineFrom(clock.now().monoMs, ms(3_600_000));
    const result = await waitForSession(
      runtime,
      agent,
      clock,
      deadline,
      3_600_000,
      graceMs,
      () => {},
      () => ({ uncommittedPaths: 2, debriefMissing: false }),
    );

    expect(result).toEqual({ _tag: "Ok", value: "done" });
    expect(requestedWaits[1]).toBe(graceMs);
    expect(clock.now().monoMs).toBe(graceMs);
  });

  it("caps the unfinished-settle grace window at the run's own deadline", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const runTimeoutMs = 10_000;
    const graceMs = 300_000;
    const requestedWaits: number[] = [];
    const script: AgentStatus[] = ["done"];
    const runtime = stubRuntime({
      waitUntil: (_agent, until, timeoutMs) => {
        requestedWaits.push(timeoutMs);
        const next = script.shift();
        if (next !== undefined) {
          clock.advanceBy(ms(2_000));
          return Promise.resolve(ok(next));
        }
        clock.advanceBy(ms(timeoutMs));
        return Promise.resolve(err({ kind: "timeout", until, timeoutMs, status: "done" }));
      },
    });

    const deadline = deadlineFrom(clock.now().monoMs, ms(runTimeoutMs));
    const result = await waitForSession(
      runtime,
      agent,
      clock,
      deadline,
      runTimeoutMs,
      graceMs,
      () => {},
      () => ({ uncommittedPaths: 1, debriefMissing: false }),
    );

    expect(result).toEqual({ _tag: "Ok", value: "done" });
    expect(requestedWaits[1]).toBe(8_000);
    expect(clock.now().monoMs).toBe(runTimeoutMs);
  });

  it("narrates both uncommitted paths and a missing debrief when both hold", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const script: AgentStatus[] = ["idle"];
    const runtime = stubRuntime({
      waitUntil: (_agent, until, timeoutMs) => {
        const next = script.shift();
        if (next !== undefined) return Promise.resolve(ok(next));
        return Promise.resolve(err({ kind: "timeout", until, timeoutMs, status: "idle" }));
      },
    });
    const lines: string[] = [];

    const deadline = deadlineFrom(clock.now().monoMs, ms(60_000));
    await waitForSession(
      runtime,
      agent,
      clock,
      deadline,
      60_000,
      5_000,
      (line) => lines.push(line),
      () => ({ uncommittedPaths: 3, debriefMissing: true }),
    );

    expect(lines).toEqual([
      "agent settled with 3 uncommitted paths and no debrief; judging in 5s unless it resumes",
    ]);
  });

  it("narrates only the uncommitted-paths half when the debrief is already committed", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const script: AgentStatus[] = ["idle"];
    const runtime = stubRuntime({
      waitUntil: (_agent, until, timeoutMs) => {
        const next = script.shift();
        if (next !== undefined) return Promise.resolve(ok(next));
        return Promise.resolve(err({ kind: "timeout", until, timeoutMs, status: "idle" }));
      },
    });
    const lines: string[] = [];

    const deadline = deadlineFrom(clock.now().monoMs, ms(60_000));
    await waitForSession(
      runtime,
      agent,
      clock,
      deadline,
      60_000,
      5_000,
      (line) => lines.push(line),
      () => ({ uncommittedPaths: 1, debriefMissing: false }),
    );

    expect(lines).toEqual([
      "agent settled with 1 uncommitted path; judging in 5s unless it resumes",
    ]);
  });

  it("narrates only the missing-debrief half when the tree is otherwise clean", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const script: AgentStatus[] = ["idle"];
    const runtime = stubRuntime({
      waitUntil: (_agent, until, timeoutMs) => {
        const next = script.shift();
        if (next !== undefined) return Promise.resolve(ok(next));
        return Promise.resolve(err({ kind: "timeout", until, timeoutMs, status: "idle" }));
      },
    });
    const lines: string[] = [];

    const deadline = deadlineFrom(clock.now().monoMs, ms(60_000));
    await waitForSession(
      runtime,
      agent,
      clock,
      deadline,
      60_000,
      5_000,
      (line) => lines.push(line),
      () => ({ uncommittedPaths: 0, debriefMissing: true }),
    );

    expect(lines).toEqual(["agent settled with no debrief; judging in 5s unless it resumes"]);
  });
});

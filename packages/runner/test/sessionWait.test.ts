import { createControlledClock, deadlineFrom, ms } from "@phyxiusjs/clock";
import { err, isErr, ok } from "@phyxiusjs/fp";
import { describe, expect, it } from "vitest";
import { waitForSession } from "../src/sessionWait.ts";
import type { Agent, AgentStatus, Runtime } from "../src/runtime.ts";

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
  it("waits through blocked, then working, before settling on idle", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const statuses: AgentStatus[] = ["blocked", "working", "idle"];
    const untilSeen: (readonly AgentStatus[])[] = [];
    const runtime = stubRuntime({
      waitUntil: (_agent, until) => {
        untilSeen.push(until);
        return Promise.resolve(ok(statuses.shift() ?? "idle"));
      },
      read: () =>
        Promise.resolve(ok("> ran the gates\n> needs a shell approval\n\n")),
    });
    const lines: string[] = [];

    const deadline = deadlineFrom(clock.now().monoMs, ms(60_000));
    const result = await waitForSession(
      runtime,
      agent,
      clock,
      deadline,
      (line) => lines.push(line),
    );

    expect(result).toEqual({ _tag: "Ok", value: "idle" });
    expect(statuses).toHaveLength(0);
    expect(untilSeen).toEqual([
      ["idle", "blocked", "done"],
      ["working", "idle", "done"],
      ["idle", "blocked", "done"],
    ]);
    expect(lines).toEqual([
      "agent blocked; answer in pane pane-1: > needs a shell approval",
      "agent working",
    ]);
  });

  it("narrates a screen-read failure inline rather than losing the blocked turn", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const statuses: AgentStatus[] = ["blocked", "idle"];
    const runtime = stubRuntime({
      waitUntil: () => Promise.resolve(ok(statuses.shift() ?? "idle")),
      read: () =>
        Promise.resolve(
          err({ kind: "transport", because: "the pane vanished" }),
        ),
    });
    const lines: string[] = [];

    const deadline = deadlineFrom(clock.now().monoMs, ms(60_000));
    const result = await waitForSession(
      runtime,
      agent,
      clock,
      deadline,
      (line) => lines.push(line),
    );

    expect(result).toEqual({ _tag: "Ok", value: "idle" });
    expect(lines).toEqual([
      "agent blocked; answer in pane pane-1: (screen unreadable: the pane vanished)",
    ]);
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
      () => {},
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
      waitUntil: () =>
        Promise.resolve(
          err({ kind: "transport", because: "the socket closed" }),
        ),
    });

    const deadline = deadlineFrom(clock.now().monoMs, ms(60_000));
    const result = await waitForSession(
      runtime,
      agent,
      clock,
      deadline,
      () => {},
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
      () => {},
    );

    expect(calls).toBe(0);
    expect(isErr(result)).toBe(true);
    if (isErr(result))
      expect(result.error).toEqual({
        kind: "timeout",
        until: ["idle", "blocked", "done"],
        timeoutMs: 0,
        status: "unknown",
      });
  });
});

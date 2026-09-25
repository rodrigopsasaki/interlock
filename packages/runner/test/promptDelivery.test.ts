import { createControlledClock, ms } from "@phyxiusjs/clock";
import { err, ok } from "@phyxiusjs/fp";
import { describe, expect, it } from "vitest";
import { deliverOpeningPrompt, type PromptDeliveryRequest } from "../src/promptDelivery.ts";
import type { Agent, Runtime } from "../src/runtime.ts";

const agent: Agent = { id: "agent-1", pane: { id: "pane-1" } };

function stubRuntime(overrides: Partial<Runtime> = {}): Runtime {
  return {
    openPane: () => Promise.resolve(ok({ id: "pane-1" })),
    startAgent: (pane) => Promise.resolve(ok({ id: "agent-1", pane })),
    reportIdentity: () => Promise.resolve(ok(undefined)),
    prompt: () => Promise.resolve(ok(undefined)),
    waitUntil: () => Promise.resolve(ok("working")),
    read: () => Promise.resolve(ok("")),
    sendKeys: () => Promise.resolve(ok(undefined)),
    sendPaneKeys: () => Promise.resolve(ok(undefined)),
    closePane: () => Promise.resolve(ok(undefined)),
    ...overrides,
  };
}

function requestFor(
  runtime: Runtime,
  clock: PromptDeliveryRequest["clock"],
  lines: string[],
  overrides: Partial<Omit<PromptDeliveryRequest, "runtime" | "clock" | "narrate" | "agent">> = {},
): PromptDeliveryRequest {
  return {
    runtime,
    agent,
    clock,
    narrate: (line) => lines.push(line),
    prompt: "the opening prompt",
    readySettleMs: 0,
    promptRetries: 2,
    promptTakenTimeoutMs: 20_000,
    answerGraceMs: 300_000,
    startupAnswers: [],
    ...overrides,
  };
}

describe("deliverOpeningPrompt settle", () => {
  it("waits the settle delay on the clock before the opening prompt, narrating it", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const lines: string[] = [];
    let promptCalledAtMs: number | undefined;
    const runtime = stubRuntime({
      prompt: () => {
        promptCalledAtMs = clock.now().monoMs;
        return Promise.resolve(ok(undefined));
      },
    });

    const promise = deliverOpeningPrompt(
      requestFor(runtime, clock, lines, { readySettleMs: 5_000 }),
    );
    expect(promptCalledAtMs).toBeUndefined();
    clock.advanceBy(ms(5_000));
    const result = await promise;

    expect(result).toEqual({
      _tag: "Ok",
      value: { kind: "taken", status: "working" },
    });
    expect(promptCalledAtMs).toBe(5_000);
    expect(lines).toEqual([
      "settling 5000ms before the opening prompt",
      "prompt sent",
      "agent working",
    ]);
  });

  it("narrates nothing extra when ready_settle_ms is 0", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const lines: string[] = [];
    const runtime = stubRuntime();

    await deliverOpeningPrompt(requestFor(runtime, clock, lines, { readySettleMs: 0 }));

    expect(lines).toEqual(["prompt sent", "agent working"]);
  });
});

describe("deliverOpeningPrompt pre-first-attempt startup answer", () => {
  it("applies a matching startup answer to the screen before the opening prompt, and narrates the match", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const lines: string[] = [];
    const agentKeysSent: (readonly string[])[] = [];
    const promptCalls: string[] = [];
    const runtime = stubRuntime({
      read: () => Promise.resolve(ok("Trust this folder? (y/n)")),
      sendKeys: (_agent, keys) => {
        agentKeysSent.push(keys);
        return Promise.resolve(ok(undefined));
      },
      prompt: (_agent, text) => {
        promptCalls.push(text);
        return Promise.resolve(ok(undefined));
      },
    });

    const result = await deliverOpeningPrompt(
      requestFor(runtime, clock, lines, {
        startupAnswers: [{ matches: "Trust this folder", keys: ["Enter"] }],
      }),
    );

    expect(agentKeysSent).toEqual([["Enter"]]);
    expect(promptCalls).toHaveLength(1);
    expect(result).toEqual({
      _tag: "Ok",
      value: { kind: "taken", status: "working" },
    });
    expect(lines).toEqual([
      'startup answer matched "Trust this folder"; sent Enter',
      "prompt sent",
      "agent working",
    ]);
  });

  it("skips the pre-prompt screen read when no startup answers are configured", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const lines: string[] = [];
    let readCalls = 0;
    const runtime = stubRuntime({
      read: () => {
        readCalls += 1;
        return Promise.resolve(ok(""));
      },
    });

    await deliverOpeningPrompt(requestFor(runtime, clock, lines));

    expect(readCalls).toBe(0);
  });
});

describe("deliverOpeningPrompt: a prompt-call error is inconclusive", () => {
  it("lets the taken-wait decide instead of refusing on a failed agent.prompt call", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const lines: string[] = [];
    const runtime = stubRuntime({
      prompt: () =>
        Promise.resolve(err({ kind: "remote", code: "agent_pane_busy", message: "busy" })),
    });

    const result = await deliverOpeningPrompt(requestFor(runtime, clock, lines));

    expect(result).toEqual({
      _tag: "Ok",
      value: { kind: "taken", status: "working" },
    });
    expect(lines).toEqual([
      "prompt call returned agent_pane_busy; waiting for working",
      "agent working",
    ]);
  });

  it("falls back to the refusal kind when the adapter's error carries no remote code", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const lines: string[] = [];
    const runtime = stubRuntime({
      prompt: () => Promise.resolve(err({ kind: "transport", because: "socket hiccup" })),
    });

    await deliverOpeningPrompt(requestFor(runtime, clock, lines));

    expect(lines).toEqual(["prompt call returned transport; waiting for working", "agent working"]);
  });
});

describe("deliverOpeningPrompt retries", () => {
  it("retries with a bare submit keystroke on attempt 2, and a working observation after it counts as taken", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const lines: string[] = [];
    const paneKeysSent: (readonly string[])[] = [];
    let waitCalls = 0;
    const runtime = stubRuntime({
      waitUntil: (_agent, until, timeoutMs) => {
        waitCalls += 1;
        if (waitCalls === 1) {
          return Promise.resolve(err({ kind: "timeout", until, timeoutMs, status: "idle" }));
        }
        return Promise.resolve(ok("working"));
      },
      sendPaneKeys: (_pane, keys) => {
        paneKeysSent.push(keys);
        return Promise.resolve(ok(undefined));
      },
    });

    const result = await deliverOpeningPrompt(requestFor(runtime, clock, lines));

    expect(paneKeysSent).toEqual([["Enter"]]);
    expect(result).toEqual({
      _tag: "Ok",
      value: { kind: "taken", status: "working" },
    });
    expect(lines).toEqual([
      "prompt sent",
      "prompt not taken after 20000ms; retrying (1 of 2): submit keystroke",
      "agent working",
    ]);
  });

  it("answers a matching startup dialog on the keystroke attempt instead of sending Enter", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const lines: string[] = [];
    const agentKeysSent: (readonly string[])[] = [];
    const paneKeysSent: (readonly string[])[] = [];
    let waitCalls = 0;
    let screenText = "";
    const runtime = stubRuntime({
      read: () => Promise.resolve(ok(screenText)),
      waitUntil: (_agent, until, timeoutMs) => {
        waitCalls += 1;
        if (waitCalls === 1) {
          screenText = "Is this a project you trust?";
          return Promise.resolve(err({ kind: "timeout", until, timeoutMs, status: "idle" }));
        }
        return Promise.resolve(ok("working"));
      },
      sendKeys: (_agent, keys) => {
        agentKeysSent.push(keys);
        return Promise.resolve(ok(undefined));
      },
      sendPaneKeys: (_pane, keys) => {
        paneKeysSent.push(keys);
        return Promise.resolve(ok(undefined));
      },
    });

    const result = await deliverOpeningPrompt(
      requestFor(runtime, clock, lines, {
        startupAnswers: [{ matches: "project you trust", keys: ["Down", "Enter"] }],
      }),
    );

    expect(agentKeysSent).toEqual([["Down", "Enter"]]);
    expect(paneKeysSent).toEqual([]);
    expect(result).toEqual({
      _tag: "Ok",
      value: { kind: "taken", status: "working" },
    });
    expect(lines).toContain('startup answer matched "project you trust"; sent Down Enter');
  });

  it("re-sends the full opening prompt on attempt 3", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const lines: string[] = [];
    const promptTexts: string[] = [];
    let waitCalls = 0;
    const runtime = stubRuntime({
      prompt: (_agent, text) => {
        promptTexts.push(text);
        return Promise.resolve(ok(undefined));
      },
      waitUntil: (_agent, until, timeoutMs) => {
        waitCalls += 1;
        if (waitCalls < 3) {
          return Promise.resolve(err({ kind: "timeout", until, timeoutMs, status: "idle" }));
        }
        return Promise.resolve(ok("working"));
      },
    });

    const result = await deliverOpeningPrompt(
      requestFor(runtime, clock, lines, { prompt: "the opening prompt" }),
    );

    expect(promptTexts).toEqual(["the opening prompt", "the opening prompt"]);
    expect(result).toEqual({
      _tag: "Ok",
      value: { kind: "taken", status: "working" },
    });
    expect(lines).toEqual([
      "prompt sent",
      "prompt not taken after 20000ms; retrying (1 of 2): submit keystroke",
      "prompt not taken after 20000ms; retrying (2 of 2): opening prompt",
      "agent working",
    ]);
  });

  it("returns immediately on a non-idle-timeout wait refusal, without retrying", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const lines: string[] = [];
    let waitCalls = 0;
    const runtime = stubRuntime({
      waitUntil: () => {
        waitCalls += 1;
        return Promise.resolve(err({ kind: "transport", because: "the socket closed" }));
      },
    });

    const result = await deliverOpeningPrompt(requestFor(runtime, clock, lines));

    expect(waitCalls).toBe(1);
    expect(result).toEqual({
      _tag: "Err",
      error: { kind: "transport", because: "the socket closed" },
    });
  });

  it("an inconclusive screen read during a keystroke retry narrates and lets the wait decide, rather than refusing", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const lines: string[] = [];
    let readCalls = 0;
    let waitCalls = 0;
    const runtime = stubRuntime({
      read: () => {
        readCalls += 1;
        return readCalls === 1
          ? Promise.resolve(ok(""))
          : Promise.resolve(err({ kind: "transport", because: "the pane vanished" }));
      },
      waitUntil: (_agent, until, timeoutMs) => {
        waitCalls += 1;
        if (waitCalls === 1) {
          return Promise.resolve(err({ kind: "timeout", until, timeoutMs, status: "idle" }));
        }
        return Promise.resolve(ok("working"));
      },
    });

    const result = await deliverOpeningPrompt(
      requestFor(runtime, clock, lines, {
        startupAnswers: [{ matches: "anything", keys: ["Enter"] }],
      }),
    );

    expect(readCalls).toBe(2);
    expect(result).toEqual({
      _tag: "Ok",
      value: { kind: "taken", status: "working" },
    });
    expect(lines).toEqual([
      "prompt sent",
      "prompt not taken after 20000ms; retrying (1 of 2): submit keystroke",
      "screen read returned transport; waiting for working",
      "agent working",
    ]);
  });
});

describe("deliverOpeningPrompt: the other delivery-side calls are inconclusive too", () => {
  it("proceeds to the wait when the submit keystroke call errors, and a working observation after it counts as taken", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const lines: string[] = [];
    let waitCalls = 0;
    const runtime = stubRuntime({
      sendPaneKeys: () =>
        Promise.resolve(err({ kind: "remote", code: "agent_pane_busy", message: "busy" })),
      waitUntil: (_agent, until, timeoutMs) => {
        waitCalls += 1;
        if (waitCalls === 1) {
          return Promise.resolve(err({ kind: "timeout", until, timeoutMs, status: "idle" }));
        }
        return Promise.resolve(ok("working"));
      },
    });

    const result = await deliverOpeningPrompt(requestFor(runtime, clock, lines));

    expect(result).toEqual({
      _tag: "Ok",
      value: { kind: "taken", status: "working" },
    });
    expect(lines).toEqual([
      "prompt sent",
      "prompt not taken after 20000ms; retrying (1 of 2): submit keystroke",
      "submit keystroke returned agent_pane_busy; waiting for working",
      "agent working",
    ]);
  });

  it("an inconclusive screen read on the pre-loop check still lets the opening prompt go out", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const lines: string[] = [];
    let promptCalls = 0;
    const runtime = stubRuntime({
      read: () => Promise.resolve(err({ kind: "transport", because: "the pane vanished" })),
      prompt: () => {
        promptCalls += 1;
        return Promise.resolve(ok(undefined));
      },
    });

    const result = await deliverOpeningPrompt(
      requestFor(runtime, clock, lines, {
        startupAnswers: [{ matches: "anything", keys: ["Enter"] }],
      }),
    );

    expect(promptCalls).toBe(1);
    expect(result).toEqual({
      _tag: "Ok",
      value: { kind: "taken", status: "working" },
    });
    expect(lines).toEqual([
      "screen read returned transport; waiting for working",
      "prompt sent",
      "agent working",
    ]);
  });

  it("an inconclusive startup-answer keys send lets the wait decide instead of refusing", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const lines: string[] = [];
    let waitCalls = 0;
    let screenText = "";
    const runtime = stubRuntime({
      read: () => Promise.resolve(ok(screenText)),
      sendKeys: () =>
        Promise.resolve(err({ kind: "remote", code: "agent_pane_busy", message: "busy" })),
      waitUntil: (_agent, until, timeoutMs) => {
        waitCalls += 1;
        if (waitCalls === 1) {
          screenText = "Is this a project you trust?";
          return Promise.resolve(err({ kind: "timeout", until, timeoutMs, status: "idle" }));
        }
        return Promise.resolve(ok("working"));
      },
    });

    const result = await deliverOpeningPrompt(
      requestFor(runtime, clock, lines, {
        startupAnswers: [{ matches: "project you trust", keys: ["Down", "Enter"] }],
      }),
    );

    expect(result).toEqual({
      _tag: "Ok",
      value: { kind: "taken", status: "working" },
    });
    expect(lines).toEqual([
      "prompt sent",
      "prompt not taken after 20000ms; retrying (1 of 2): submit keystroke",
      "startup answer returned agent_pane_busy; waiting for working",
      "agent working",
    ]);
  });
});

describe("deliverOpeningPrompt: every attempt fails", () => {
  it("keeps the pane in play through the grace window, and continues when working arrives inside it", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const lines: string[] = [];
    const graceRequests: number[] = [];
    const runtime = stubRuntime({
      waitUntil: (_agent, until, timeoutMs) => {
        if (until.length === 1 && until[0] === "working") {
          graceRequests.push(timeoutMs);
          return Promise.resolve(ok("working"));
        }
        return Promise.resolve(err({ kind: "timeout", until, timeoutMs, status: "idle" }));
      },
    });

    const result = await deliverOpeningPrompt(
      requestFor(runtime, clock, lines, { answerGraceMs: 300_000 }),
    );

    expect(result).toEqual({ _tag: "Ok", value: { kind: "resumed-in-grace" } });
    expect(graceRequests).toEqual([300_000]);
    expect(lines).toContain(
      "opening prompt not taken after 3 attempts; pane pane-1 stays open; a person may deliver it by hand",
    );
    expect(lines.at(-1)).toBe("agent working");
  });

  it("judges the session abandoned when the grace window passes with the agent still idle", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const lines: string[] = [];
    const runtime = stubRuntime({
      waitUntil: (_agent, until, timeoutMs) =>
        Promise.resolve(err({ kind: "timeout", until, timeoutMs, status: "idle" })),
    });

    const result = await deliverOpeningPrompt(requestFor(runtime, clock, lines));

    expect(result).toEqual({
      _tag: "Ok",
      value: { kind: "abandoned", attempts: 3 },
    });
    expect(lines.at(-1)).toBe(
      "opening prompt not taken after 3 attempts; pane pane-1 stays open; a person may deliver it by hand",
    );
  });

  it("makes exactly one attempt when prompt_retries is 0, with no retry narration", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const lines: string[] = [];
    let promptCalls = 0;
    const runtime = stubRuntime({
      prompt: () => {
        promptCalls += 1;
        return Promise.resolve(ok(undefined));
      },
      waitUntil: (_agent, until, timeoutMs) =>
        Promise.resolve(err({ kind: "timeout", until, timeoutMs, status: "idle" })),
    });

    const result = await deliverOpeningPrompt(
      requestFor(runtime, clock, lines, { promptRetries: 0 }),
    );

    expect(promptCalls).toBe(1);
    expect(result).toEqual({
      _tag: "Ok",
      value: { kind: "abandoned", attempts: 1 },
    });
    expect(lines.some((line) => line.includes("retrying"))).toBe(false);
    expect(lines).toContain(
      "opening prompt not taken after 1 attempts; pane pane-1 stays open; a person may deliver it by hand",
    );
  });
});

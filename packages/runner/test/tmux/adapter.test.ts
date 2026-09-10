import { ok } from "@phyxiusjs/fp";
import { describe, expect, it } from "vitest";
import {
  createTmuxRuntime,
  type TmuxCommandRunner,
} from "../../src/tmux/adapter.ts";

function recordingRunner(): {
  runner: TmuxCommandRunner;
  calls: (readonly string[])[];
} {
  const calls: (readonly string[])[] = [];
  const runner: TmuxCommandRunner = (args) => {
    calls.push(args);
    return Promise.resolve(ok("ok"));
  };
  return { runner, calls };
}

describe("tmux adapter", () => {
  it("opens a pane with a detached new session at the given cwd", async () => {
    const { runner, calls } = recordingRunner();
    const runtime = createTmuxRuntime(runner);
    const pane = await runtime.openPane("/repo/worktree");

    expect(calls).toHaveLength(1);
    const [args] = calls;
    expect(args?.slice(0, 2)).toEqual(["new-session", "-d"]);
    expect(args).toContain("-c");
    expect(args).toContain("/repo/worktree");
    expect(pane._tag).toBe("Ok");
  });

  it("starts an agent by sending its command line into the pane", async () => {
    const { runner, calls } = recordingRunner();
    const runtime = createTmuxRuntime(runner);
    const pane = await runtime.openPane("/repo");
    if (pane._tag !== "Ok") throw new Error("expected a pane");

    await runtime.startAgent(pane.value, "claude", ["--flag", "value"]);

    const sendKeys = calls[1];
    expect(sendKeys).toEqual([
      "send-keys",
      "-t",
      pane.value.id,
      "claude --flag value",
      "Enter",
    ]);
  });

  it("always times out waiting for an agent state, honestly, since tmux cannot see it", async () => {
    const { runner } = recordingRunner();
    const runtime = createTmuxRuntime(runner);
    const pane = await runtime.openPane("/repo");
    if (pane._tag !== "Ok") throw new Error("expected a pane");
    const agent = await runtime.startAgent(pane.value, "claude", []);
    if (agent._tag !== "Ok") throw new Error("expected an agent");

    const waited = await runtime.waitUntil(agent.value, ["idle", "done"], 500);
    expect(waited).toEqual({
      _tag: "Err",
      error: {
        kind: "timeout",
        until: ["idle", "done"],
        timeoutMs: 500,
        status: "unknown",
      },
    });
  });

  it("sends keys to a pane via send-keys", async () => {
    const { runner, calls } = recordingRunner();
    const runtime = createTmuxRuntime(runner);
    const pane = await runtime.openPane("/repo");
    if (pane._tag !== "Ok") throw new Error("expected a pane");
    const agent = await runtime.startAgent(pane.value, "claude", []);
    if (agent._tag !== "Ok") throw new Error("expected an agent");

    await runtime.sendKeys(agent.value, ["Down", "Enter"]);

    expect(calls[2]).toEqual([
      "send-keys",
      "-t",
      pane.value.id,
      "Down",
      "Enter",
    ]);
  });

  it("reads a pane by capturing it", async () => {
    const { runner, calls } = recordingRunner();
    const runtime = createTmuxRuntime(runner);
    const pane = await runtime.openPane("/repo");
    if (pane._tag !== "Ok") throw new Error("expected a pane");
    const agent = await runtime.startAgent(pane.value, "claude", []);
    if (agent._tag !== "Ok") throw new Error("expected an agent");

    await runtime.read(agent.value);

    expect(calls[2]).toEqual(["capture-pane", "-t", pane.value.id, "-p"]);
  });

  it("closes a pane by killing its session", async () => {
    const { runner, calls } = recordingRunner();
    const runtime = createTmuxRuntime(runner);
    const pane = await runtime.openPane("/repo");
    if (pane._tag !== "Ok") throw new Error("expected a pane");

    await runtime.closePane(pane.value);

    expect(calls[1]).toEqual(["kill-session", "-t", pane.value.id]);
  });
});

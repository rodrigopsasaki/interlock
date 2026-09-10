import { mkdirSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { randomUUID } from "node:crypto";
import { isErr } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import {
  createHerdrRuntime,
  generateAgentName,
  isCompliantAgentName,
} from "../../src/herdr/adapter.ts";
import { startFakeHerdrServer, type FakeHerdrServer } from "./fakeServer.ts";

// A Unix socket path is capped at ~104 bytes (macOS sockaddr_un): short and relative to this
// process's own cwd (vitest runs each package from its own directory), not this worktree's
// full absolute path, which alone can exceed the limit.
const runsRoot = join(import.meta.dirname, "..", ".runs");
mkdirSync(runsRoot, { recursive: true });

let server: FakeHerdrServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
  rmSync(runsRoot, { recursive: true, force: true });
  mkdirSync(runsRoot, { recursive: true });
});

async function fixture(): Promise<FakeHerdrServer> {
  const socketPath = relative(
    process.cwd(),
    join(runsRoot, `${randomUUID().slice(0, 8)}.sock`),
  );
  server = await startFakeHerdrServer(socketPath);
  return server;
}

describe("herdr adapter", () => {
  it("refuses with no-socket when nothing is listening", async () => {
    const missing = relative(process.cwd(), join(runsRoot, "no-such.sock"));
    const created = await createHerdrRuntime(missing);
    expect(isErr(created)).toBe(true);
    if (isErr(created)) expect(created.error.kind).toBe("no-socket");
  });

  it("refuses to start an agent kind herdr does not accept", async () => {
    const fake = await fixture();
    const created = await createHerdrRuntime(fake.socketPath);
    if (isErr(created)) throw new Error("expected a runtime");
    const pane = await created.value.openPane("/repo");
    if (isErr(pane)) throw new Error("expected a pane");

    const started = await created.value.startAgent(
      pane.value,
      "not-a-real-kind",
      [],
    );
    expect(isErr(started)).toBe(true);
    if (isErr(started))
      expect(started.error).toEqual({
        kind: "unknown-agent-kind",
        agentKind: "not-a-real-kind",
      });
  });

  it("drives a pane through open, start, report, wait, read and close", async () => {
    const fake = await fixture();
    fake.agentStatus = "idle";
    const created = await createHerdrRuntime(fake.socketPath);
    if (isErr(created)) throw new Error("expected a runtime");
    const runtime = created.value;

    const pane = await runtime.openPane("/repo/worktree");
    if (isErr(pane)) throw new Error("expected a pane");

    const agent = await runtime.startAgent(pane.value, "claude", ["--flag"]);
    if (isErr(agent)) throw new Error("expected an agent");

    const reported = await runtime.reportIdentity(
      agent.value,
      "0001-bootstrap/runner-command-gate/session-1",
      {
        sessionId: "session-1",
      },
    );
    expect(isErr(reported)).toBe(false);

    const waited = await runtime.waitUntil(
      agent.value,
      ["idle", "blocked", "done"],
      5_000,
    );
    expect(waited).toEqual({ _tag: "Ok", value: "idle" });

    const read = await runtime.read(agent.value);
    expect(read).toEqual({ _tag: "Ok", value: "fake agent output" });

    const closed = await runtime.closePane(pane.value);
    expect(isErr(closed)).toBe(false);

    const methods = fake.calls.map((call) => call.method);
    expect(methods).toEqual([
      "workspace.create",
      "agent.start",
      "pane.report_agent",
      "pane.report_agent_session",
      "agent.wait",
      "agent.read",
      "pane.close",
    ]);
    const reportedSession = fake.calls.find(
      (call) => call.method === "pane.report_agent_session",
    );
    expect(reportedSession?.params["source"]).toBe("interlock");
    expect(reportedSession?.params["agent_session_id"]).toBe("session-1");
  });

  it("sends an opening prompt to the named agent, without a wait clause", async () => {
    const fake = await fixture();
    const created = await createHerdrRuntime(fake.socketPath);
    if (isErr(created)) throw new Error("expected a runtime");
    const runtime = created.value;

    const pane = await runtime.openPane("/repo/worktree");
    if (isErr(pane)) throw new Error("expected a pane");
    const agent = await runtime.startAgent(pane.value, "claude", []);
    if (isErr(agent)) throw new Error("expected an agent");

    const prompted = await runtime.prompt(agent.value, "read your brief first");
    expect(isErr(prompted)).toBe(false);

    const promptCall = fake.calls.find(
      (call) => call.method === "agent.prompt",
    );
    expect(promptCall?.params["target"]).toBe(agent.value.id);
    expect(promptCall?.params["text"]).toBe("read your brief first");
    expect(promptCall?.params["wait"]).toBeUndefined();
  });

  it("sends keys to the named agent via agent.send_keys", async () => {
    const fake = await fixture();
    const created = await createHerdrRuntime(fake.socketPath);
    if (isErr(created)) throw new Error("expected a runtime");
    const runtime = created.value;

    const pane = await runtime.openPane("/repo/worktree");
    if (isErr(pane)) throw new Error("expected a pane");
    const agent = await runtime.startAgent(pane.value, "claude", []);
    if (isErr(agent)) throw new Error("expected an agent");

    const sent = await runtime.sendKeys(agent.value, ["Down", "Enter"]);
    expect(isErr(sent)).toBe(false);

    const sendKeysCall = fake.calls.find(
      (call) => call.method === "agent.send_keys",
    );
    expect(sendKeysCall?.params["target"]).toBe(agent.value.id);
    expect(sendKeysCall?.params["keys"]).toEqual(["Down", "Enter"]);
  });

  it("times out when the agent never reaches a requested state", async () => {
    const fake = await fixture();
    fake.agentStatus = "working";
    const created = await createHerdrRuntime(fake.socketPath);
    if (isErr(created)) throw new Error("expected a runtime");
    const pane = await created.value.openPane("/repo");
    if (isErr(pane)) throw new Error("expected a pane");
    const agent = await created.value.startAgent(pane.value, "claude", []);
    if (isErr(agent)) throw new Error("expected an agent");

    const waited = await created.value.waitUntil(
      agent.value,
      ["idle", "done"],
      1_000,
    );
    expect(isErr(waited)).toBe(true);
    if (isErr(waited)) expect(waited.error.kind).toBe("timeout");
  });

  it("sends a herdr-compliant agent name on agent.start", async () => {
    const fake = await fixture();
    const created = await createHerdrRuntime(fake.socketPath);
    if (isErr(created)) throw new Error("expected a runtime");
    const pane = await created.value.openPane("/repo");
    if (isErr(pane)) throw new Error("expected a pane");

    const agent = await created.value.startAgent(pane.value, "claude", []);
    if (isErr(agent)) throw new Error("expected an agent");
    expect(isCompliantAgentName(agent.value.id)).toBe(true);

    const startCall = fake.calls.find((call) => call.method === "agent.start");
    expect(startCall?.params["name"]).toBe(agent.value.id);
  });

  it("sends an explicit startup timeout_ms on agent.start", async () => {
    const fake = await fixture();
    const created = await createHerdrRuntime(fake.socketPath);
    if (isErr(created)) throw new Error("expected a runtime");
    const pane = await created.value.openPane("/repo");
    if (isErr(pane)) throw new Error("expected a pane");

    const agent = await created.value.startAgent(pane.value, "claude", []);
    if (isErr(agent)) throw new Error("expected an agent");

    const startCall = fake.calls.find((call) => call.method === "agent.start");
    expect(startCall?.params["timeout_ms"]).toBe(60_000);
  });

  it("settles a call with herdr's own code and message when it answers with an error frame", async () => {
    const fake = await fixture();
    const created = await createHerdrRuntime(fake.socketPath);
    if (isErr(created)) throw new Error("expected a runtime");

    fake.failNextCall(
      "invalid_agent_name",
      "agent name must start with a lowercase letter and contain only lowercase letters, digits, '-' or '_' (1-32 characters)",
    );
    const pane = await created.value.openPane("/repo");
    expect(isErr(pane)).toBe(true);
    if (isErr(pane))
      expect(pane.error).toEqual({
        kind: "remote",
        code: "invalid_agent_name",
        message:
          "agent name must start with a lowercase letter and contain only lowercase letters, digits, '-' or '_' (1-32 characters)",
      });
  });

  it("settles two calls back to back, each on its own connection", async () => {
    const fake = await fixture();
    const created = await createHerdrRuntime(fake.socketPath);
    if (isErr(created)) throw new Error("expected a runtime");
    const runtime = created.value;

    const first = await runtime.openPane("/repo/one");
    expect(isErr(first)).toBe(false);
    const second = await runtime.openPane("/repo/two");
    expect(isErr(second)).toBe(false);

    expect(fake.calls.map((call) => call.method)).toEqual([
      "workspace.create",
      "workspace.create",
    ]);
  });

  it("settles a withheld response as a call-timeout refusal naming the method", async () => {
    const fake = await fixture();
    const created = await createHerdrRuntime(fake.socketPath, 100);
    if (isErr(created)) throw new Error("expected a runtime");

    fake.withholdNextCall();
    const pane = await created.value.openPane("/repo");
    expect(isErr(pane)).toBe(true);
    if (isErr(pane))
      expect(pane.error).toEqual({
        kind: "call-timeout",
        method: "workspace.create",
        timeoutMs: 100,
      });
  });
});

describe("herdr agent name compliance", () => {
  it("generates names that start with a lowercase letter and use only lowercase letters, digits, - or _", () => {
    for (let i = 0; i < 50; i += 1) {
      const name = generateAgentName();
      expect(isCompliantAgentName(name)).toBe(true);
      expect(name.length).toBeLessThanOrEqual(32);
    }
  });

  it("accepts the boundary cases of herdr's rule", () => {
    expect(isCompliantAgentName("a")).toBe(true);
    expect(isCompliantAgentName("il-1a2b3c4d")).toBe(true);
    expect(isCompliantAgentName("a".repeat(32))).toBe(true);
  });

  it("rejects names herdr's own error would reject", () => {
    expect(isCompliantAgentName("")).toBe(false);
    expect(isCompliantAgentName("Il-1a2b3c4d")).toBe(false);
    expect(isCompliantAgentName("1nterlock")).toBe(false);
    expect(isCompliantAgentName("il on")).toBe(false);
    expect(isCompliantAgentName("a".repeat(33))).toBe(false);
    expect(isCompliantAgentName(`interlock-${randomUUID()}`)).toBe(false);
  });
});

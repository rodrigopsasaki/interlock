import { mkdirSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { randomUUID } from "node:crypto";
import { isErr } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import {
  WAIT_SLICE_MS,
  createHerdrRuntime,
  generateAgentName,
  isCompliantAgentName,
} from "../../src/herdr/adapter.ts";
import { startFakeHerdrServer, type FakeHerdrServer } from "./fakeServer.ts";

// A Unix socket path is capped at ~104 bytes (macOS sockaddr_un): short and relative to this
// process's own cwd (vitest runs each package from its own directory), not this worktree's
// full absolute path, which alone can exceed the limit. Its own directory, never the one
// gateJudge.test.ts and backfill.test.ts mkdtemp under: this file wipes the whole thing every
// test, which would delete their live fixtures if the two were the same directory.
const runsRoot = join(import.meta.dirname, "..", ".herdr-runs");
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
      "0001-bootstrap",
      "runner-command-gate",
      { sessionId: "session-1" },
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
      "pane.report_metadata",
      "agent.get",
      "agent.read",
      "pane.close",
    ]);
  });

  it("reports identity as pane metadata, never as pane.report_agent", async () => {
    const fake = await fixture();
    const created = await createHerdrRuntime(fake.socketPath);
    if (isErr(created)) throw new Error("expected a runtime");
    const runtime = created.value;

    const pane = await runtime.openPane("/repo/worktree");
    if (isErr(pane)) throw new Error("expected a pane");
    const agent = await runtime.startAgent(pane.value, "claude", []);
    if (isErr(agent)) throw new Error("expected an agent");

    const reported = await runtime.reportIdentity(
      agent.value,
      "0001-bootstrap",
      "runner-command-gate",
      { sessionId: "session-1" },
    );
    expect(isErr(reported)).toBe(false);

    const metadataCalls = fake.calls.filter(
      (call) => call.method === "pane.report_metadata",
    );
    expect(metadataCalls).toHaveLength(1);
    expect(
      fake.calls.some((call) => call.method.startsWith("pane.report_agent")),
    ).toBe(false);

    const [metadataCall] = metadataCalls;
    expect(metadataCall?.params["pane_id"]).toBe(pane.value.id);
    expect(metadataCall?.params["source"]).toBe("interlock");
    expect(metadataCall?.params["tokens"]).toEqual({
      graph: "0001-bootstrap",
      node: "runner-command-gate",
      session: "session-1",
    });
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

  it("returns at once, without ever calling agent.wait, when the status is already in until", async () => {
    const fake = await fixture();
    fake.agentStatus = "idle";
    const created = await createHerdrRuntime(fake.socketPath);
    if (isErr(created)) throw new Error("expected a runtime");
    const pane = await created.value.openPane("/repo");
    if (isErr(pane)) throw new Error("expected a pane");
    const agent = await created.value.startAgent(pane.value, "claude", []);
    if (isErr(agent)) throw new Error("expected an agent");

    const waited = await created.value.waitUntil(
      agent.value,
      ["idle", "blocked", "done"],
      5_000,
    );
    expect(waited).toEqual({ _tag: "Ok", value: "idle" });
    expect(fake.calls.some((call) => call.method === "agent.wait")).toBe(false);
  });

  it("loops past a slice herdr never answers, returning the status the next agent.get reports", async () => {
    const fake = await fixture();
    fake.agentStatus = "working";
    fake.withholdNextCall("agent.wait");
    setTimeout(() => {
      fake.agentStatus = "idle";
    }, 300);
    const created = await createHerdrRuntime(
      fake.socketPath,
      30_000,
      60_000,
      100,
    );
    if (isErr(created)) throw new Error("expected a runtime");
    const pane = await created.value.openPane("/repo");
    if (isErr(pane)) throw new Error("expected a pane");
    const agent = await created.value.startAgent(pane.value, "claude", []);
    if (isErr(agent)) throw new Error("expected an agent");

    const waited = await created.value.waitUntil(
      agent.value,
      ["idle", "blocked", "done"],
      7_000,
    );
    expect(waited).toEqual({ _tag: "Ok", value: "idle" });
    expect(
      fake.calls.filter((call) => call.method === "agent.wait"),
    ).toHaveLength(1);
    expect(
      fake.calls.filter((call) => call.method === "agent.get"),
    ).toHaveLength(2);
  }, 10_000);

  it("refuses with a timeout naming the caller's budget once two slices pass with nothing changing", async () => {
    const fake = await fixture();
    fake.agentStatus = "working";
    fake.delayAgentWaitToRequestedTimeout = true;
    const created = await createHerdrRuntime(
      fake.socketPath,
      30_000,
      60_000,
      60,
    );
    if (isErr(created)) throw new Error("expected a runtime");
    const pane = await created.value.openPane("/repo");
    if (isErr(pane)) throw new Error("expected a pane");
    const agent = await created.value.startAgent(pane.value, "claude", []);
    if (isErr(agent)) throw new Error("expected an agent");

    const waited = await created.value.waitUntil(
      agent.value,
      ["idle", "done"],
      100,
    );
    expect(isErr(waited)).toBe(true);
    if (isErr(waited)) {
      expect(waited.error).toEqual({
        kind: "timeout",
        until: ["idle", "done"],
        timeoutMs: 100,
        status: "working",
      });
    }
    expect(
      fake.calls.filter((call) => call.method === "agent.wait"),
    ).toHaveLength(2);
  }, 10_000);

  // Real herdr answers a timed-out agent.wait with a remote error whose code is "timeout", not
  // a status payload. That error is the slice elapsing, exactly like an unanswered call: the
  // loop keeps going, and the status it eventually returns comes from the next agent.get.
  it("reads two herdr-timeout errors from agent.wait as elapsed slices, returning the status agent.get reports next", async () => {
    const fake = await fixture();
    fake.agentStatus = "working";
    fake.delayAgentWaitToRequestedTimeout = true;
    setTimeout(() => {
      fake.agentStatus = "idle";
    }, 150);
    const created = await createHerdrRuntime(
      fake.socketPath,
      30_000,
      60_000,
      100,
    );
    if (isErr(created)) throw new Error("expected a runtime");
    const pane = await created.value.openPane("/repo");
    if (isErr(pane)) throw new Error("expected a pane");
    const agent = await created.value.startAgent(pane.value, "claude", []);
    if (isErr(agent)) throw new Error("expected an agent");

    const waited = await created.value.waitUntil(
      agent.value,
      ["idle", "blocked", "done"],
      7_000,
    );
    expect(waited).toEqual({ _tag: "Ok", value: "idle" });
    expect(
      fake.calls.filter((call) => call.method === "agent.wait"),
    ).toHaveLength(2);
  }, 10_000);

  it("returns a remote refusal from agent.wait without retrying", async () => {
    const fake = await fixture();
    fake.agentStatus = "working";
    fake.failNextCall("agent_gone", "no such agent", 1, "agent.wait");
    const created = await createHerdrRuntime(fake.socketPath);
    if (isErr(created)) throw new Error("expected a runtime");
    const pane = await created.value.openPane("/repo");
    if (isErr(pane)) throw new Error("expected a pane");
    const agent = await created.value.startAgent(pane.value, "claude", []);
    if (isErr(agent)) throw new Error("expected an agent");

    const waited = await created.value.waitUntil(
      agent.value,
      ["idle", "done"],
      5_000,
    );
    expect(isErr(waited)).toBe(true);
    if (isErr(waited)) {
      expect(waited.error).toEqual({
        kind: "remote",
        code: "agent_gone",
        message: "no such agent",
      });
    }
    expect(
      fake.calls.filter((call) => call.method === "agent.wait"),
    ).toHaveLength(1);
  });

  // WAIT_SLICE_MS bounds a single agent.wait request to herdr. The incident that motivated R1
  // staked a whole run's remaining budget, up to an hour, on one such call ever answering; sixty
  // seconds is short enough that the adapter is back checking agent.get long before any real
  // session's own wait budget could plausibly be spent on herdr going quiet mid-call.
  it("bounds a single agent.wait request to sixty seconds", () => {
    expect(WAIT_SLICE_MS).toBe(60_000);
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

  it("names the agent after the node id when it is herdr-compliant", async () => {
    const fake = await fixture();
    const created = await createHerdrRuntime(fake.socketPath);
    if (isErr(created)) throw new Error("expected a runtime");
    const pane = await created.value.openPane("/repo");
    if (isErr(pane)) throw new Error("expected a pane");

    const agent = await created.value.startAgent(
      pane.value,
      "claude",
      [],
      undefined,
      "runner-command-gate",
    );
    if (isErr(agent)) throw new Error("expected an agent");
    expect(agent.value.id).toBe("runner-command-gate");

    const startCall = fake.calls.find((call) => call.method === "agent.start");
    expect(startCall?.params["name"]).toBe("runner-command-gate");
  });

  it("falls back to a generated name when the node id does not fit herdr's rule", async () => {
    const fake = await fixture();
    const created = await createHerdrRuntime(fake.socketPath);
    if (isErr(created)) throw new Error("expected a runtime");
    const pane = await created.value.openPane("/repo");
    if (isErr(pane)) throw new Error("expected a pane");

    const agent = await created.value.startAgent(
      pane.value,
      "claude",
      [],
      undefined,
      "Runner Command Gate!",
    );
    if (isErr(agent)) throw new Error("expected an agent");
    expect(isCompliantAgentName(agent.value.id)).toBe(true);
    expect(agent.value.id).not.toBe("Runner Command Gate!");

    const startCalls = fake.calls.filter(
      (call) => call.method === "agent.start",
    );
    expect(startCalls).toHaveLength(1);
  });

  it("falls back to a generated name once herdr refuses the node id, without retrying that same name", async () => {
    const fake = await fixture();
    const created = await createHerdrRuntime(fake.socketPath);
    if (isErr(created)) throw new Error("expected a runtime");
    const pane = await created.value.openPane("/repo");
    if (isErr(pane)) throw new Error("expected a pane");

    fake.failNextCall("agent_name_taken", "an agent named that already exists");
    const agent = await created.value.startAgent(
      pane.value,
      "claude",
      [],
      undefined,
      "runner-command-gate",
    );
    if (isErr(agent)) throw new Error("expected an agent");
    expect(agent.value.id).not.toBe("runner-command-gate");
    expect(isCompliantAgentName(agent.value.id)).toBe(true);

    const startCalls = fake.calls.filter(
      (call) => call.method === "agent.start",
    );
    expect(startCalls.map((call) => call.params["name"])).toEqual([
      "runner-command-gate",
      agent.value.id,
    ]);
  });

  it("does not retry a busy pane refusal as a name-fallback: it keeps the preferred name", async () => {
    const fake = await fixture();
    const created = await createHerdrRuntime(fake.socketPath);
    if (isErr(created)) throw new Error("expected a runtime");
    const pane = await created.value.openPane("/repo");
    if (isErr(pane)) throw new Error("expected a pane");

    fake.failNextCall(
      "agent_pane_busy",
      "agent target pane fake-pane-1 is not an available shell",
      1,
    );
    const agent = await created.value.startAgent(
      pane.value,
      "claude",
      [],
      undefined,
      "runner-command-gate",
    );
    if (isErr(agent)) throw new Error("expected an agent");
    expect(agent.value.id).toBe("runner-command-gate");

    const startCalls = fake.calls.filter(
      (call) => call.method === "agent.start",
    );
    expect(
      startCalls.every((call) => call.params["name"] === "runner-command-gate"),
    ).toBe(true);
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

  it("retries agent.start on agent_pane_busy until the pane's shell is ready", async () => {
    const fake = await fixture();
    const created = await createHerdrRuntime(fake.socketPath);
    if (isErr(created)) throw new Error("expected a runtime");
    const pane = await created.value.openPane("/repo");
    if (isErr(pane)) throw new Error("expected a pane");

    fake.failNextCall(
      "agent_pane_busy",
      "agent target pane fake-pane-1 is not an available shell",
      2,
    );
    let waits = 0;
    const agent = await created.value.startAgent(
      pane.value,
      "claude",
      [],
      () => {
        waits += 1;
      },
    );

    expect(isErr(agent)).toBe(false);
    expect(waits).toBe(1);
    expect(
      fake.calls.filter((call) => call.method === "agent.start"),
    ).toHaveLength(3);
  });

  it("returns a non-busy refusal from agent.start at once, without retrying", async () => {
    const fake = await fixture();
    const created = await createHerdrRuntime(fake.socketPath);
    if (isErr(created)) throw new Error("expected a runtime");
    const pane = await created.value.openPane("/repo");
    if (isErr(pane)) throw new Error("expected a pane");

    fake.failNextCall(
      "invalid_agent_name",
      "agent name must start with a lowercase letter and contain only lowercase letters, digits, '-' or '_' (1-32 characters)",
    );
    let waits = 0;
    const agent = await created.value.startAgent(
      pane.value,
      "claude",
      [],
      () => {
        waits += 1;
      },
    );

    expect(isErr(agent)).toBe(true);
    if (isErr(agent)) expect(agent.error.kind).toBe("remote");
    if (isErr(agent) && agent.error.kind === "remote")
      expect(agent.error.code).toBe("invalid_agent_name");
    expect(waits).toBe(0);
    expect(
      fake.calls.filter((call) => call.method === "agent.start"),
    ).toHaveLength(1);
  });

  it("gives up on agent_pane_busy once its wait budget elapses, naming the total wait", async () => {
    const fake = await fixture();
    const created = await createHerdrRuntime(fake.socketPath, 30_000, 700);
    if (isErr(created)) throw new Error("expected a runtime");
    const pane = await created.value.openPane("/repo");
    if (isErr(pane)) throw new Error("expected a pane");

    fake.failNextCall(
      "agent_pane_busy",
      "agent target pane fake-pane-1 is not an available shell",
      50,
    );
    const agent = await created.value.startAgent(pane.value, "claude", []);

    expect(isErr(agent)).toBe(true);
    if (isErr(agent)) {
      expect(agent.error).toEqual({
        kind: "remote",
        code: "agent_pane_busy",
        message:
          "agent target pane fake-pane-1 is not an available shell (waited 700ms for the pane's shell)",
      });
    }
  }, 10_000);
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

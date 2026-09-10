import { mkdirSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { randomUUID } from "node:crypto";
import { isErr } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import { createHerdrRuntime } from "../../src/herdr/adapter.ts";
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
});

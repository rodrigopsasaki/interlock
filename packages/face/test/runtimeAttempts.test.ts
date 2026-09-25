import { fold, type LedgerEvent, type SessionRuntime, sessionRuntime } from "ledger";
import { describe, expect, it } from "vitest";
import { lastAttemptByRuntimeName } from "../src/runtimeAttempts.ts";

function brief(node: string) {
  return {
    graph: "demo",
    node,
    role: "worker",
    acceptance: "x",
    gates: [],
    scope: [],
  };
}

function started(session: string, runtime: SessionRuntime): LedgerEvent {
  return {
    kind: "session-started",
    session: { id: session, node: { graph: "demo", id: "a" }, runtime },
    brief: brief("a"),
    graphBaseSha: "deadbeef",
  };
}

describe("lastAttemptByRuntimeName", () => {
  it("skips sessions whose runtime is unknown, so they never shadow a declared one", () => {
    const projection = fold([started("session-1", sessionRuntime.unknown())]);
    const attempts = lastAttemptByRuntimeName(projection);
    expect(attempts.size).toBe(0);
  });

  it("keeps the attempt recorded latest in the journal for each runtime name", () => {
    const projection = fold([
      started("session-1", sessionRuntime.declared("luna", "codex", "gpt-5.6-luna")),
      { kind: "session-narrated", session: "session-1", at: 1000, line: "first" },
      started("session-2", sessionRuntime.declared("luna", "codex", "gpt-5.6-luna")),
      { kind: "session-narrated", session: "session-2", at: 2000, line: "second" },
    ]);
    const attempt = lastAttemptByRuntimeName(projection).get("luna");
    expect(attempt?.session).toBe("session-2");
    expect(attempt?.startedAtWallMs).toBe(2000);
  });

  it("keeps one entry per runtime name when several runtimes have attempts", () => {
    const projection = fold([
      started("session-1", sessionRuntime.declared("luna", "codex", undefined)),
      started("session-2", sessionRuntime.declared("k3", "kimi", "kimi-code/k3")),
      started("session-3", sessionRuntime.unknown()),
    ]);
    const attempts = lastAttemptByRuntimeName(projection);
    expect(attempts.get("luna")?.session).toBe("session-1");
    expect(attempts.get("k3")?.session).toBe("session-2");
  });

  it("leaves a runtime with no attempt absent from the map", () => {
    const projection = fold([
      started("session-1", sessionRuntime.declared("luna", "codex", undefined)),
    ]);
    const attempts = lastAttemptByRuntimeName(projection);
    expect(attempts.has("k3")).toBe(false);
    expect(attempts.get("k3")).toBeUndefined();
  });

  it("reports no start time for an attempt whose session was never narrated", () => {
    const projection = fold([
      started("session-1", sessionRuntime.declared("luna", "codex", undefined)),
    ]);
    expect(lastAttemptByRuntimeName(projection).get("luna")?.startedAtWallMs).toBeUndefined();
  });
});

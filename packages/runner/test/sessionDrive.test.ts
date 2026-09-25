import { err, ok } from "@phyxiusjs/fp";
import { sessionFacts } from "ledger";
import { describe, expect, it } from "vitest";
import type { Agent, AgentIdentity, Runtime, SessionFactsReader } from "../src/runtime.ts";
import { observeSessionFacts } from "../src/sessionDrive.ts";

const agent: Agent = { id: "agent-1", pane: { id: "pane-1" } };

function runtimeWith(reader: SessionFactsReader | undefined, observed: AgentIdentity[]): Runtime {
  return {
    sessionFactsReaderFor: () => reader,
    openPane: async () => ok(agent.pane),
    startAgent: async (pane) => ok({ id: agent.id, pane }),
    reportIdentity: async () => ok(undefined),
    resolveAgentIdentity: async (_agent, fallback) => {
      const identity = { ...fallback, sessionPath: "fixture-record.jsonl" };
      observed.push(identity);
      return ok(identity);
    },
    prompt: async () => ok(undefined),
    waitUntil: async (_agent, until, timeoutMs) => {
      if (until.length === 0) return err({ kind: "timeout", until, timeoutMs, status: "idle" });
      return ok(until[0] ?? "unknown");
    },
    read: async () => ok(""),
    sendKeys: async () => ok(undefined),
    sendPaneKeys: async () => ok(undefined),
    closePane: async () => ok(undefined),
  };
}

describe("observeSessionFacts", () => {
  it("selects the reader by runtime kind and resolves the observed identity", async () => {
    const observed: AgentIdentity[] = [];
    const reader: SessionFactsReader = {
      read: async (identity) =>
        identity.sessionPath === "fixture-record.jsonl"
          ? {
              ...sessionFacts.unknown(),
              promptReceived: sessionFacts.known("yes"),
              deliveryBasis: "record",
            }
          : { ...sessionFacts.unknown(), deliveryBasis: "record" },
    };

    const facts = await observeSessionFacts({
      runtime: runtimeWith(reader, observed),
      agent,
      fallback: { sessionId: "runner-session" },
      agentKind: "claude",
      cwd: "/fixture/worktree",
    });

    expect(facts.promptReceived).toEqual({ state: "known", value: "yes" });
    expect(facts.deliveryBasis).toBe("record");
    expect(observed).toEqual([
      { sessionId: "runner-session", sessionPath: "fixture-record.jsonl" },
    ]);
  });

  it("keeps an unknown runtime on the status-basis rule", async () => {
    const facts = await observeSessionFacts({
      runtime: runtimeWith(undefined, []),
      agent,
      fallback: { sessionId: "runner-session" },
      agentKind: "kimi",
      cwd: "/fixture/worktree",
    });

    expect(facts).toEqual(sessionFacts.unknown());
  });
});

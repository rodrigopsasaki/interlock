import { join } from "node:path";
import { isSessionFacts, sessionFacts } from "ledger";
import { describe, expect, it } from "vitest";
import { createClaudeSessionFactsReader } from "../../src/claude/adapter.ts";

const FIXTURES = join(import.meta.dirname, "..", "fixtures", "claude");

describe("claude session facts reader", () => {
  const reader = createClaudeSessionFactsReader();

  it("stays unknown when the identity carries no session path", async () => {
    const facts = await reader.read({ sessionId: "no-path-session" });
    expect(facts).toEqual({ ...sessionFacts.unknown(), deliveryBasis: "record" });
  });

  it("stays unknown when the session path does not resolve to a readable record", async () => {
    const facts = await reader.read({
      sessionId: "missing-session",
      sessionPath: join(FIXTURES, "does-not-exist.jsonl"),
    });
    expect(facts).toEqual({ ...sessionFacts.unknown(), deliveryBasis: "record" });
  });

  it("stays unknown when the record is empty", async () => {
    const facts = await reader.read({
      sessionId: "empty-session",
      sessionPath: join(FIXTURES, "empty.jsonl"),
    });
    expect(facts).toEqual({ ...sessionFacts.unknown(), deliveryBasis: "record" });
  });

  it("extracts opening prompt receipt, last activity and aggregated usage from a confirmed record", async () => {
    const facts = await reader.read({
      sessionId: "11111111-1111-4111-8111-111111111111",
      sessionPath: join(FIXTURES, "session-with-usage.jsonl"),
    });

    expect(isSessionFacts(facts)).toBe(true);
    expect(facts.promptReceived).toEqual({ state: "known", value: "yes" });
    expect(facts.deliveryBasis).toBe("record");
    expect(facts.lastActivity).toEqual({
      state: "known",
      value: "2026-01-01T00:00:10.000Z",
    });
    expect(facts.usage).toEqual({
      state: "known",
      value: {
        input: 14,
        output: 16,
        cachedInput: 22,
        reasoning: 3,
        raw: {
          input_tokens: 14,
          output_tokens: 16,
          cache_creation_input_tokens: 5,
          cache_read_input_tokens: 22,
          thinking_tokens: 3,
        },
      },
    });
    expect(facts.quota).toEqual({ state: "unknown" });
  });

  it("degrades only the prompt-received fact when no genuine opening turn is present", async () => {
    const facts = await reader.read({
      sessionId: "22222222-2222-4222-8222-222222222222",
      sessionPath: join(FIXTURES, "no-opening-prompt.jsonl"),
    });

    expect(isSessionFacts(facts)).toBe(true);
    expect(facts.promptReceived).toEqual({ state: "unknown" });
    expect(facts.deliveryBasis).toBe("record");
    expect(facts.lastActivity).toEqual({
      state: "known",
      value: "2026-01-02T00:00:05.000Z",
    });
    expect(facts.usage).toEqual({
      state: "known",
      value: {
        input: 6,
        output: 3,
        cachedInput: 1,
        raw: { input_tokens: 6, output_tokens: 3, cache_read_input_tokens: 1 },
      },
    });
  });

  it("skips an unparseable line rather than failing the whole record", async () => {
    const facts = await reader.read({
      sessionId: "33333333-3333-4333-8333-333333333333",
      sessionPath: join(FIXTURES, "malformed.jsonl"),
    });

    expect(isSessionFacts(facts)).toBe(true);
    expect(facts.promptReceived).toEqual({ state: "known", value: "yes" });
    expect(facts.deliveryBasis).toBe("record");
    expect(facts.lastActivity).toEqual({
      state: "known",
      value: "2026-01-03T00:00:05.000Z",
    });
    expect(facts.usage).toEqual({
      state: "known",
      value: {
        input: 8,
        output: 2,
        cachedInput: 1,
        raw: { input_tokens: 8, output_tokens: 2, cache_read_input_tokens: 1 },
      },
    });
  });

  it("never reports a Claude quota: no rate-limit or quota field exists in this vendor's record", async () => {
    const facts = await reader.read({
      sessionId: "11111111-1111-4111-8111-111111111111",
      sessionPath: join(FIXTURES, "session-with-usage.jsonl"),
    });
    expect(facts.quota).toEqual({ state: "unknown" });
  });
});

import { join } from "node:path";
import { sessionFacts } from "ledger";
import { describe, expect, it } from "vitest";
import { createCodexSessionFactsReader, readCodexSessionFacts } from "../../src/herdr/codex.ts";
import type { AgentIdentity } from "../../src/runtime.ts";

const fixtures = join(import.meta.dirname, "..", "fixtures", "codex-rollouts");

function identity(sessionPath: string): AgentIdentity {
  return { sessionId: "fixture-session", sessionPath };
}

describe("Codex session facts reader", () => {
  it("does not infer prompt receipt from a preamble or usage record", async () => {
    const facts = await readCodexSessionFacts(
      identity(join(fixtures, "dropped-opening-prompt.jsonl")),
    );

    expect(facts.promptReceived).toEqual({ state: "unknown" });
    expect(facts.deliveryBasis).toBe("record");
    expect(facts.lastActivity).toEqual({ state: "known", value: "2026-09-25T06:00:01Z" });
    expect(facts.usage).toEqual({
      state: "known",
      value: {
        input: 12,
        output: 0,
        cachedInput: 0,
        reasoning: 0,
        raw: {
          input_tokens: 12,
          cached_input_tokens: 0,
          output_tokens: 0,
          reasoning_output_tokens: 0,
          total_tokens: 12,
        },
      },
    });
    expect(facts.quota).toEqual({
      state: "known",
      value: { window: "10080 minutes", usedPercentage: 1.5 },
    });
  });

  it("matches the opening prompt text across user items and uses cumulative latest values", async () => {
    const reader = createCodexSessionFactsReader();
    const facts = await reader.read(identity(join(fixtures, "opening-prompt-resend.jsonl")));

    expect(facts.promptReceived).toEqual({ state: "known", value: "yes" });
    expect(facts.lastActivity).toEqual({ state: "known", value: "2026-09-25T06:01:02Z" });
    expect(facts.usage).toEqual({
      state: "known",
      value: {
        input: 220,
        output: 40,
        cachedInput: 160,
        reasoning: 8,
        raw: {
          input_tokens: 220,
          cached_input_tokens: 160,
          cache_write_input_tokens: 0,
          output_tokens: 40,
          reasoning_output_tokens: 8,
          total_tokens: 268,
        },
      },
    });
    expect(facts.quota).toEqual({
      state: "known",
      value: { window: "10080 minutes", usedPercentage: 28.5 },
    });
  });

  it("returns record-basis unknowns for unavailable, malformed, or incomplete records", async () => {
    const reader = createCodexSessionFactsReader();
    const missing = await reader.read(identity(join(fixtures, "missing.jsonl")));
    const malformed = await reader.read(identity(join(fixtures, "malformed.jsonl")));
    const absentPath = await reader.read({ sessionId: "fixture-session" });

    for (const facts of [missing, malformed, absentPath]) {
      expect(facts).toEqual({
        ...sessionFacts.unknown(),
        deliveryBasis: "record",
      });
    }
  });
});

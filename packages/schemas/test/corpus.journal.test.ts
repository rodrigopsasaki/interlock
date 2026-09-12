import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildRegistry } from "../src/registry.ts";
import { describeOutcome, isRefusal, judgeValue } from "../src/validate.ts";

const ledgerFixtures = join(import.meta.dirname, "..", "..", "ledger", "test", "fixtures");

const journals = [
  "journal-v1-approved.jsonl",
  "journal-v1-v2-2026-09-10.jsonl",
  "journal-v3-v4-2026-09-11.jsonl",
];

describe("corpus: every line of the fixture journals validates against its event schema", () => {
  const registry = buildRegistry();
  const perTag = new Map<string, number>();

  for (const file of journals) {
    const path = join(ledgerFixtures, file);
    const lines = readFileSync(path, "utf-8")
      .split("\n")
      .map((text, index) => ({ text, line: index + 1 }))
      .filter(({ text }) => text.trim().length > 0);

    it(`${file} carries at least one line`, () => {
      expect(lines.length).toBeGreaterThan(0);
    });

    for (const { text, line } of lines) {
      it(`${file}:${line} validates`, () => {
        const value: unknown = JSON.parse(text);
        const outcome = judgeValue(registry, value);
        expect(isRefusal(outcome), describeOutcome(outcome)).toBe(false);
        if (outcome.kind === "valid") {
          perTag.set(outcome.tag, (perTag.get(outcome.tag) ?? 0) + 1);
        }
      });
    }
  }

  it("counted at least one line for event@v1, event@v2 and event@v3", () => {
    for (const tag of ["event@v1", "event@v2", "event@v3"]) {
      expect(perTag.get(tag) ?? 0, `${tag} count`).toBeGreaterThan(0);
    }
  });
});

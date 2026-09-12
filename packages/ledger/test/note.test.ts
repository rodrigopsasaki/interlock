import { describe, expect, it } from "vitest";
import { isNote, note } from "../src/note.js";

describe("note", () => {
  it("builds a choice with its because", () => {
    const choice = note.choice(
      "2026-09-09T12:00:00Z",
      "used @phyxiusjs/fp for refusals",
      "the reference already leans on it",
    );
    expect(isNote(choice)).toBe(true);
    expect(choice.kind === "choice" && choice.rejected).toBeUndefined();
  });

  it("builds a choice with rejected alternatives", () => {
    const choice = note.choice(
      "2026-09-09T12:00:00Z",
      "kept spend on the receipt",
      "matches the acceptance",
      ["a separate spend table"],
    );
    expect(choice.kind === "choice" && choice.rejected).toEqual(["a separate spend table"]);
  });

  it("builds a surprise with expected and observed", () => {
    const surprise = note.surprise(
      "2026-09-09T12:00:00Z",
      "pnpm test --filter ledger -- --grep replay to work",
      "pnpm has no --filter after the script name",
    );
    expect(isNote(surprise)).toBe(true);
  });

  it("rejects a kind outside the closed set", () => {
    expect(isNote({ kind: "observation", at: "now" })).toBe(false);
  });
});

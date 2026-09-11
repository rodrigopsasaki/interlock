import { describe, expect, it } from "vitest";
import { buildOpeningPrompt } from "../src/openingPrompt.ts";

describe("buildOpeningPrompt", () => {
  it("names the brief path for a fresh worktree, with no prior-work sentence", () => {
    const prompt = buildOpeningPrompt("0001-bootstrap", "runner-command-gate");
    expect(prompt).toContain(
      ".interlock/sessions/0001-bootstrap/runner-command-gate/brief.md",
    );
    expect(prompt).not.toContain("carries work from an earlier session");
  });

  it("appends a prior-work sentence naming both counts when the worktree was resumed", () => {
    const prompt = buildOpeningPrompt("0001-bootstrap", "runner-command-gate", {
      uncommittedPaths: 22,
      commitsBeyondBase: 0,
    });
    expect(prompt).toContain(
      "This worktree carries work from an earlier session of this node: " +
        "22 uncommitted path(s) and 0 commit(s) beyond the graph base. " +
        "Read notes.yaml, git status and git log before you continue, and do not redo finished work.",
    );
  });
});

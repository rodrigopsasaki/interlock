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

  it("names the scratch rules: test/.runs/, never /tmp, plain rm never rm -rf", () => {
    const prompt = buildOpeningPrompt("0001-bootstrap", "runner-command-gate");
    expect(prompt).toContain(
      "Keep scratch work under this package's test/.runs/ directory, never /tmp, " +
        "and remove it with plain rm, never rm -rf.",
    );
  });

  it("names the resume rule for a dropped connection or an early-ended turn", () => {
    const prompt = buildOpeningPrompt("0001-bootstrap", "runner-command-gate");
    expect(prompt).toContain(
      "If the connection drops or your turn ends early, the next prompt resumes " +
        "from git status and notes.yaml.",
    );
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

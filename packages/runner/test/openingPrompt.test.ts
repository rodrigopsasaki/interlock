import { describe, expect, it } from "vitest";
import { buildOpeningPrompt } from "../src/openingPrompt.ts";

describe("buildOpeningPrompt", () => {
  it("gives every worker the explicit debrief revision handoff", () => {
    expect(buildOpeningPrompt("g", "n")).toBe(
      "This is an interlock session for node n of graph g. " +
        "Your brief is at .interlock/sessions/g/n/brief.md in this worktree. " +
        "Read it first and treat it as binding. Work only in this worktree. " +
        "Append .interlock/sessions/g/n/notes.yaml at every choice and surprise, " +
        "commit as you go, and file .interlock/sessions/g/n/debrief.yaml as your final commit. " +
        "For a first filing, run interlock debrief prepare g n --to <candidate-path> --agent-runtime <runtime> --agent-model <model>, or replace both agent flags with --human <name>; author its claims and reports, then run " +
        "interlock debrief file-derived g n --from <candidate-path>. After source changes, commit, prepare a fresh candidate, author it, and file it. " +
        "When correcting an authored debrief, keep the correction in this session directory and run " +
        "interlock debrief revise g n --from <candidate-path> to select it. " +
        "When the debrief is committed, stop and wait. " +
        "Keep scratch work under this package's test/.runs/ directory, never /tmp, and remove it " +
        "with plain rm, never rm -rf. " +
        "If the connection drops or your turn ends early, the next prompt resumes from git status " +
        "and notes.yaml.",
    );
  });

  it("gives a worker the prepare-author-file-derived sequence and its source-change rule", () => {
    const prompt = buildOpeningPrompt("g", "n");
    expect(prompt).toContain("interlock debrief prepare g n --to <candidate-path>");
    expect(prompt).toContain("--agent-runtime <runtime> --agent-model <model>");
    expect(prompt).toContain("--human <name>");
    expect(prompt).toContain("interlock debrief file-derived g n --from <candidate-path>");
    expect(prompt).toContain("After source changes, commit, prepare a fresh candidate, author it, and file it");
  });

  it("names the brief path for a fresh worktree, with no prior-work sentence", () => {
    const prompt = buildOpeningPrompt("0001-bootstrap", "runner-command-gate");
    expect(prompt).toContain(".interlock/sessions/0001-bootstrap/runner-command-gate/brief.md");
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

  it("says nothing about producing a graph for a worker session, the default role", () => {
    const prompt = buildOpeningPrompt("0001-bootstrap", "runner-command-gate");
    expect(prompt).not.toContain("never leases or runs a node");
  });

  it("names what an interpreter session produces and that it never leases or runs a node", () => {
    const prompt = buildOpeningPrompt("demo", "plan/demo", undefined, "interpreter");
    expect(prompt).toContain(".interlock/graphs/demo.yaml");
    expect(prompt).toContain("for a person to approve or correct");
    expect(prompt).toContain("it never leases or runs a node");
  });

  it("directs a view-mode session to the included view, without the legacy brief-first instruction", () => {
    const prompt = buildOpeningPrompt("demo", "a", undefined, "worker", "Prompt projection.");
    expect(prompt).toContain("Read the derived opening view included below first");
    expect(prompt).toContain("the canonical brief remains binding and is available on demand");
    expect(prompt).not.toContain("Read it first and treat it as binding.");
    expect(prompt.endsWith("\n\nPrompt projection.")).toBe(true);
  });

  it("retains interpreter and recovery instructions when a view is supplied", () => {
    const prompt = buildOpeningPrompt(
      "demo",
      "plan/demo",
      { uncommittedPaths: 1, commitsBeyondBase: 2 },
      "interpreter",
      "Prompt projection.",
    );
    expect(prompt).toContain(".interlock/graphs/demo.yaml");
    expect(prompt).toContain("it never leases or runs a node");
    expect(prompt).toContain("1 uncommitted path(s) and 2 commit(s) beyond the graph base");
    expect(prompt).toContain("Read notes.yaml, git status and git log before you continue");
    expect(prompt).not.toContain("Read it first and treat it as binding.");
  });
});

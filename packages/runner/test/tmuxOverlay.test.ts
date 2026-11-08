import { ok } from "@phyxiusjs/fp";
import { describe, expect, it } from "vitest";
import { createTmuxRuntime, type TmuxCommandRunner } from "../src/tmux/adapter.ts";

describe("tmux Codex overlay delivery", () => {
  it("passes the prepared environment into the new session", async () => {
    const calls: (readonly string[])[] = [];
    const runner: TmuxCommandRunner = (args) => {
      calls.push(args);
      return Promise.resolve(ok(""));
    };
    const runtime = createTmuxRuntime(runner);
    await runtime.openPane("/repo/worktree", { CODEX_HOME: "/state/codex-homes/session" });
    expect(calls[0]).toContain("-e");
    expect(calls[0]).toContain("CODEX_HOME=/state/codex-homes/session");
  });
});

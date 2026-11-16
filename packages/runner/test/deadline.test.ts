import { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  commandRunnerWithDeadline,
  createJudgeDeadline,
  JudgeDeadlineExceeded,
  resolveJudgeTimeout,
  waitForHeldLease,
} from "../src/deadline.ts";

const children: number[] = [];

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

afterEach(() => {
  for (const pid of children.splice(0)) {
    if (alive(pid)) process.kill(pid, "SIGKILL");
  }
});

describe("judge deadline", () => {
  it("a judge past its deadline ends its gate processes and says so", async () => {
    const deadline = createJudgeDeadline(0.001);
    const run = commandRunnerWithDeadline(deadline, ["slow-gate"]);

    await expect(
      run([process.execPath, "-e", "setTimeout(() => {}, 10000)"], process.cwd(), process.env),
    ).rejects.toMatchObject({
      gateId: "slow-gate",
    });
  });

  it("only processes the judge started are signalled", async () => {
    const unrelated = spawn(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], {
      detached: true,
      stdio: "ignore",
    });
    if (unrelated.pid === undefined) throw new Error("expected unrelated process pid");
    children.push(unrelated.pid);

    const deadline = createJudgeDeadline(0.001);
    const run = commandRunnerWithDeadline(deadline, ["owned-gate"]);
    await expect(
      run([process.execPath, "-e", "setTimeout(() => {}, 10000)"], process.cwd(), process.env),
    ).rejects.toBeInstanceOf(JudgeDeadlineExceeded);
    expect(alive(unrelated.pid)).toBe(true);
  });

  it("a held lease is named every minute", async () => {
    let now = 0;
    let reads = 0;
    const lines: string[] = [];
    const deadline = createJudgeDeadline(4, () => now);
    const result = await waitForHeldLease(
      deadline,
      async () => {
        reads += 1;
        return reads < 3 ? { session: "session-1", since: "2026-11-16T17:00:00.000Z" } : undefined;
      },
      (line) => lines.push(line),
      async (milliseconds) => {
        now += milliseconds;
      },
    );

    expect(result).toBe("released");
    expect(lines).toEqual([
      "judge waiting: lease held by session session-1 since 2026-11-16T17:00:00.000Z",
      "judge waiting: lease held by session session-1 since 2026-11-16T17:00:00.000Z",
    ]);
  });

  it("the per-graph timeout overrides the default", () => {
    expect(
      resolveJudgeTimeout([], "interlock: graph@v0\nid: g\njudge_timeout_minutes: 7\nnodes: []\n"),
    ).toEqual({
      kind: "resolved",
      minutes: 7,
    });
    expect(
      resolveJudgeTimeout(
        ["--timeout", "3"],
        "interlock: graph@v0\nid: g\njudge_timeout_minutes: 7\nnodes: []\n",
      ),
    ).toEqual({ kind: "resolved", minutes: 3 });
  });
});

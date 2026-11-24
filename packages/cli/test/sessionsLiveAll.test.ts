import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { buildRegistry, judgeValue } from "schemas";
import { afterEach, describe, expect, it } from "vitest";
import { createHerdrRuntime } from "../../runner/src/herdr/adapter.ts";
import { type FakeHerdrServer, startFakeHerdrServer } from "../../runner/test/herdr/fakeServer.ts";
import { runSessions } from "../src/sessions.ts";
import { initFixtureRepositoryWithIdentity } from "./support/gitFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;
let server: FakeHerdrServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

async function fixture(): Promise<{
  readonly repository: string;
  readonly runtime: Awaited<ReturnType<typeof createHerdrRuntime>>;
}> {
  directory = mkdtempSync(join(runsRoot, "live-all-"));
  const repository = join(directory, "repository");
  mkdirSync(repository, { recursive: true });
  initFixtureRepositoryWithIdentity(repository, { defaultBranch: "main" });
  const fake = await startFakeHerdrServer(
    relative(process.cwd(), join(directory, `${randomUUID()}.sock`)),
  );
  server = fake;
  const runtime = await createHerdrRuntime(fake.socketPath);
  return { repository, runtime };
}

describe("interlock sessions --live --all", () => {
  it("lists an untracked pane and validates the v1 envelope", async () => {
    const { repository, runtime } = await fixture();
    if (runtime._tag === "Err" || server === undefined)
      throw new Error("expected the fake herdr runtime");
    server.panes = [
      {
        pane_id: "pane-alone",
        cwd: repository,
        agent_session: { agent: "claude", kind: "id", value: "runtime-session" },
      },
    ];

    const result = await runSessions(["--live", "--all", "--json"], {
      cwd: repository,
      runtime: runtime.value,
    });
    expect(result.exitCode).toBe(0);
    const parsed: unknown = JSON.parse(result.message);
    const judged = judgeValue(buildRegistry(), parsed);
    expect(judged).toEqual({ kind: "valid", tag: "sessions@v1" });
    expect(parsed).toMatchObject({ count: 1, sessions: [{ transport: "pane", repository }] });
  });

  it("keeps no-all JSON compatible with sessions@v0 and removes row shapes", async () => {
    const { repository, runtime } = await fixture();
    if (runtime._tag === "Err") throw new Error("expected the fake herdr runtime");

    const result = await runSessions(["--live", "--json"], {
      cwd: repository,
      runtime: runtime.value,
    });
    expect(result.exitCode).toBe(0);
    const parsed: unknown = JSON.parse(result.message);
    const judged = judgeValue(buildRegistry(), parsed);
    expect(judged).toEqual({ kind: "valid", tag: "sessions@v0" });
    expect(result.message).not.toContain('"interlock":"sessions@v0","id"');
  });
});

import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { isErr } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import { createHerdrRuntime } from "../../src/herdr/adapter.ts";
import { type FakeHerdrServer, startFakeHerdrServer } from "./fakeServer.ts";

const runsRoot = join(import.meta.dirname, "..", ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;
let server: FakeHerdrServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

async function fixture(): Promise<FakeHerdrServer> {
  directory = mkdtempSync(join(runsRoot, "list-agents-"));
  server = await startFakeHerdrServer(
    relative(process.cwd(), join(directory, `${randomUUID()}.sock`)),
  );
  return server;
}

describe("herdr agent enumeration", () => {
  it("returns tokened and untokened agents through the runtime seam", async () => {
    const fake = await fixture();
    fake.panes = [
      {
        pane_id: "pane-tokened",
        name: "agent-tokened",
        cwd: "/repo/worktree",
        tokens: { graph: "graph", node: "node", session: "session" },
        agent_session: { agent: "claude", kind: "id", value: "runtime-session" },
      },
      { pane_id: "pane-untokened", agent: "codex" },
    ];
    const created = await createHerdrRuntime(fake.socketPath);
    if (isErr(created)) throw new Error("expected the fake herdr runtime");

    const listed = await created.value.listAgents?.();
    expect(listed).toEqual({
      _tag: "Ok",
      value: [
        {
          id: "agent-tokened",
          runtime: "claude",
          sessionId: "session",
          graph: "graph",
          node: "node",
          kind: "node",
          repository: "/repo/worktree",
          pane: "pane-tokened",
        },
        { id: "pane-untokened", runtime: "codex", pane: "pane-untokened" },
      ],
    });
    expect(fake.calls.map((call) => call.method)).toEqual(["agent.list"]);
  });

  it("returns a typed no-socket refusal when herdr is absent", async () => {
    directory = mkdtempSync(join(runsRoot, "missing-"));
    const created = await createHerdrRuntime(
      relative(process.cwd(), join(directory, "missing.sock")),
    );
    expect(isErr(created)).toBe(true);
    if (isErr(created)) expect(created.error.kind).toBe("no-socket");
  });
});

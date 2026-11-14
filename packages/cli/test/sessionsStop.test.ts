import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { isErr, ok, unwrap } from "@phyxiusjs/fp";
import { sharedJournalDirectory } from "face";
import { createLedger, readOutboxArtifact, sessionRuntime } from "ledger";
import type { Agent, Runtime } from "runner";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../src/main.ts";
import { runSessionsStop } from "../src/sessions.ts";
import { gitInitFixture } from "./graph/gitFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });
let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

const now = 10_000;
const node = { graph: "demo", id: "a" };
const brief = {
  graph: "demo",
  node: "a",
  role: "implementer" as const,
  acceptance: "stop",
  gates: [],
  scope: [],
};

function fixture(): string {
  directory = mkdtempSync(join(runsRoot, "sessions-stop-"));
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  writeFileSync(
    join(directory, ".interlock", "graphs", "demo.yaml"),
    "interlock: graph@v0\nid: demo\ngates: []\nnodes: []\n",
  );
  gitInitFixture(directory);
  return directory;
}

async function seed(
  cwd: string,
  sessions: readonly { readonly id: string; readonly expiry: number }[],
): Promise<void> {
  const ledger = unwrap(
    await createLedger({
      clock: createControlledClock({ initialTime: now }),
      directory: await sharedJournalDirectory(cwd),
    }),
  );
  for (const session of sessions) {
    ledger.append({
      kind: "session-started",
      session: { id: session.id, node, runtime: sessionRuntime.declared("fake", "pane", "model") },
      brief,
    });
    ledger.append({ kind: "lease-taken", node, session: session.id, expiry: session.expiry });
  }
  await ledger.close();
}

function paneRuntime(closed: Agent[]): Runtime {
  return {
    openPane: () => Promise.resolve(ok({ id: "unused" })),
    startAgent: (pane) => Promise.resolve(ok({ id: "agent", pane })),
    reportIdentity: () => Promise.resolve(ok(undefined)),
    prompt: () => Promise.resolve(ok(undefined)),
    waitUntil: () => Promise.resolve(ok("idle")),
    read: () => Promise.resolve(ok("")),
    sendKeys: () => Promise.resolve(ok(undefined)),
    sendPaneKeys: () => Promise.resolve(ok(undefined)),
    closePane: (pane) => {
      closed.push({ id: "agent", pane });
      return Promise.resolve(ok(undefined));
    },
    resolveAgent: () => Promise.resolve(ok({ id: "agent", pane: { id: "pane-1" } })),
  };
}

describe("interlock sessions stop", () => {
  it("closes a live pane once and records who and why in the close intent", async () => {
    const cwd = fixture();
    await seed(cwd, [{ id: "pane-session", expiry: now + 60_000 }]);
    const closed: Agent[] = [];
    const result = await runSessionsStop(
      ["pane-session", "--by", "Rodrigo", "--because", "memory pressure"],
      { cwd, clock: createControlledClock({ initialTime: now }), runtime: paneRuntime(closed) },
    );
    expect(result.exitCode).toBe(0);
    expect(closed).toHaveLength(1);
    const ledger = unwrap(
      await createLedger({
        clock: createControlledClock({ initialTime: now }),
        directory: await sharedJournalDirectory(cwd),
      }),
    );
    const effect = [...ledger.projection().outbox.values()].find(
      (view) => view.intent.target === "machine-provider/close",
    );
    expect(effect?.delivery?.state).toBe("acknowledged");
    if (effect === undefined) return;
    const request = readOutboxArtifact(`${cwd}/.interlock/ledger`, effect.intent.request);
    expect(isErr(request) ? "" : request.value.toString("utf8")).toContain("Rodrigo");
    expect(isErr(request) ? "" : request.value.toString("utf8")).toContain("memory pressure");
    await ledger.close();
  });

  it("refuses unknown, ambiguous, ended, incomplete, and open grammar without falling through", async () => {
    const cwd = fixture();
    await seed(cwd, [
      { id: "same-1", expiry: now + 60_000 },
      { id: "same-2", expiry: now + 60_000 },
      { id: "ended", expiry: now - 1 },
    ]);
    const closed: Agent[] = [];
    const options = {
      cwd,
      clock: createControlledClock({ initialTime: now }),
      runtime: paneRuntime(closed),
    };
    expect(
      (await runSessionsStop(["missing", "--by", "Rodrigo", "--because", "why"], options)).message,
    ).toContain("unknown");
    expect(
      (await runSessionsStop(["same", "--by", "Rodrigo", "--because", "why"], options)).message,
    ).toContain("ambiguous");
    expect(
      (await runSessionsStop(["ended", "--by", "Rodrigo", "--because", "why"], options)).message,
    ).toContain("ended");
    expect((await runSessionsStop(["same-1", "--by", "Rodrigo"], options)).message).toContain(
      "--because",
    );
    expect((await runSessionsStop(["same-1", "--because", "why"], options)).message).toContain(
      "--by",
    );
    expect((await run(["sessions", "frobnicate"])).message).toContain("frobnicate");
    expect((await run(["sessions", "--bogus"])).message).toContain("--bogus");
    expect(closed).toHaveLength(0);
  });
});

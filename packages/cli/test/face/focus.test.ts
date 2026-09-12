import { err, ok } from "@phyxiusjs/fp";
import type { Pane, Runtime } from "runner";
import { describe, expect, it } from "vitest";
import { focusSession } from "../../src/face/focus.ts";

function baseRuntime(): Runtime {
  return {
    openPane: () => Promise.resolve(ok({ id: "pane-1" })),
    startAgent: (pane) => Promise.resolve(ok({ id: "agent-1", pane })),
    reportIdentity: () => Promise.resolve(ok(undefined)),
    prompt: () => Promise.resolve(ok(undefined)),
    waitUntil: () => Promise.resolve(ok("idle")),
    read: () => Promise.resolve(ok("")),
    sendKeys: () => Promise.resolve(ok(undefined)),
    closePane: () => Promise.resolve(ok(undefined)),
  };
}

const query = { graph: "0001-bootstrap", node: "face", session: "s1" };

describe("focusSession", () => {
  it("resolves the pane and focuses it, both through the injected runtime", async () => {
    const focused: string[] = [];
    const runtime: Runtime = {
      ...baseRuntime(),
      resolvePane: (q) =>
        Promise.resolve(q.session === "s1" ? ok({ id: "pane-7" }) : ok(undefined)),
      focusPane: (pane: Pane) => {
        focused.push(pane.id);
        return Promise.resolve(ok(undefined));
      },
    };

    const result = await focusSession(runtime, query);
    expect(result).toEqual({ _tag: "Ok", value: true });
    expect(focused).toEqual(["pane-7"]);
  });

  it("resolves false, never a guess, when no pane matches the session", async () => {
    const runtime: Runtime = {
      ...baseRuntime(),
      resolvePane: () => Promise.resolve(ok(undefined)),
      focusPane: () => Promise.resolve(ok(undefined)),
    };
    const result = await focusSession(runtime, query);
    expect(result).toEqual({ _tag: "Ok", value: false });
  });

  it("propagates a herdr failure from resolvePane instead of pretending nothing was live", async () => {
    const runtime: Runtime = {
      ...baseRuntime(),
      resolvePane: () => Promise.resolve(err({ kind: "transport", because: "boom" })),
      focusPane: () => Promise.resolve(ok(undefined)),
    };
    const result = await focusSession(runtime, query);
    expect(result).toEqual({
      _tag: "Err",
      error: { kind: "transport", because: "boom" },
    });
  });

  it("resolves false when the runtime does not implement pane resolution or focus at all", async () => {
    const result = await focusSession(baseRuntime(), query);
    expect(result).toEqual({ _tag: "Ok", value: false });
  });
});

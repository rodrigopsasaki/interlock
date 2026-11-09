import { describe, expect, it } from "vitest";
import { execRuntimeArgv, type ResolvedRuntime } from "../src/runtimeCatalogue.ts";

const runtime: Pick<
  ResolvedRuntime,
  "args" | "readOnlyArgs" | "mcpServers" | "mcpAllow" | "mcpDisableArgs"
> = {
  args: ["fixture-agent", "--prompt", "{prompt}"],
  readOnlyArgs: [],
  mcpServers: [],
  mcpAllow: [],
  mcpDisableArgs: [],
};

describe("exec launch prompt delivery", () => {
  it("expands a phase prompt at the phase boundary", () => {
    const work = execRuntimeArgv(runtime, "work prompt");
    const debrief = execRuntimeArgv(runtime, "debrief prompt");

    expect(work).toEqual(["fixture-agent", "--prompt", "work prompt"]);
    expect(debrief).toEqual(["fixture-agent", "--prompt", "debrief prompt"]);
  });
});

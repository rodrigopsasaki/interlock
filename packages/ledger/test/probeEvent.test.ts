import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { isErr } from "@phyxiusjs/fp";
import { describe, expect, it } from "vitest";
import { derivation } from "../src/derivation.ts";
import { envelopeFor } from "../src/envelope.ts";
import { retainProbeConfig } from "../src/probe.ts";
import { parseLine } from "../src/replay.ts";

describe("probe event and configuration evidence", () => {
  it("replays event@v11 probe fields and refuses a probe tagged event@v10", () => {
    const event = {
      kind: "probe" as const,
      probeId: "probe-1",
      profile: "fast",
      configuration: "a".repeat(64),
      implementationVersion: "runtime-probe@v1",
      checks: [{ check: "shm", state: "passed" as const }],
      signedCommitKeyFingerprint: "fingerprint",
      derivation: derivation.gate("runtime-probe", "runtime-probe@v1", "runner"),
      at: 1,
    };
    expect(parseLine(JSON.stringify(envelopeFor(event))).kind).toBe("event");
    expect(parseLine(JSON.stringify({ interlock: "event@v10", ...event })).kind).toBe("refused");
  });

  it("retains identical configuration content at one content address", () => {
    const directory = mkdtempSync(join(import.meta.dirname, ".runs", "probe-config-"));
    try {
      const config = {
        interlock: "probe-config@v0" as const,
        profile: { args: "hash-a" },
        provider: { value: "hash-b" },
        environment: { value: "hash-c" },
      };
      const first = retainProbeConfig(directory, config);
      const second = retainProbeConfig(directory, config);
      expect(first).toEqual(second);
      if (isErr(first)) return;
      expect(readFileSync(first.value.path, "utf8")).toContain("probe-config@v0");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { unwrap } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import { derivation } from "../src/derivation.ts";
import { createLedger } from "../src/ledger.ts";
import {
  isOutboxArtifact,
  isOutboxDelivery,
  OUTBOX_ARTIFACT_SHAPE,
  OUTBOX_INTENT_SHAPE,
  retainOutboxArtifact,
} from "../src/outbox.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });
let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function makeLedger() {
  directory = mkdtempSync(join(runsRoot, "outbox-"));
  return createLedger({ clock: createControlledClock({ initialTime: 0 }), directory });
}

describe("outbox evidence", () => {
  it("requires exact SHA-256 identifiers, safe byte counts, and acknowledgment evidence", () => {
    const artifact = {
      interlock: OUTBOX_ARTIFACT_SHAPE,
      sha256: "a".repeat(64),
      bytes: 0,
      ref: `outbox/request/${"a".repeat(64)}.json`,
    };
    expect(isOutboxArtifact(artifact)).toBe(true);
    expect(isOutboxArtifact({ ...artifact, sha256: "a".repeat(63) })).toBe(false);
    expect(isOutboxArtifact({ ...artifact, bytes: -1 })).toBe(false);
    expect(isOutboxArtifact({ ...artifact, bytes: 1.5 })).toBe(false);
    const base = {
      id: "a".repeat(64),
      because: "retained",
      derivation: derivation.gate("outbox", "runner@0", "runner"),
    };
    expect(isOutboxDelivery({ ...base, state: "acknowledged" })).toBe(false);
    expect(isOutboxDelivery({ ...base, state: "acknowledged", acknowledgment: artifact })).toBe(
      true,
    );
    expect(isOutboxDelivery({ ...base, state: "uncertain", acknowledgment: artifact })).toBe(false);
  });

  it("returns verified bytes or explicit absent, missing, and corrupt evidence", async () => {
    const ledger = unwrap(await makeLedger());
    const node = { graph: "fixture", id: "n1" };
    const request = unwrap(
      retainOutboxArtifact(ledger.directory(), "request", Buffer.from("request")),
    );
    const id = "b".repeat(64);
    ledger.append({
      kind: "outbox-intent-recorded",
      node,
      effect: {
        interlock: OUTBOX_INTENT_SHAPE,
        id,
        node,
        session: "s1",
        target: "https://receiver.example/absorb",
        request,
        derivation: derivation.gate("outbox", "runner@0", "runner"),
      },
    });
    expect(ledger.readOutboxEvidence(node, "other", id)).toEqual({ kind: "absent" });
    expect(ledger.readOutboxEvidence(node, "s1", id)).toEqual(
      expect.objectContaining({ kind: "verified", request: Buffer.from("request") }),
    );
    writeFileSync(join(ledger.directory(), request.ref), "not json");
    expect(ledger.readOutboxEvidence(node, "s1", id)).toEqual({
      kind: "corrupt",
      ref: request.ref,
    });
  });
});

import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
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
  readOutboxArtifact,
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
    expect(isOutboxArtifact({ ...artifact, bytes: Number.MAX_SAFE_INTEGER + 1 })).toBe(false);
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

  it("returns verified evidence and classifies absent, request, and acknowledgment failures", async () => {
    const ledger = unwrap(await makeLedger());
    const node = { graph: "fixture", id: "n1" };
    const request = unwrap(
      retainOutboxArtifact(ledger.directory(), "request", Buffer.from("request")),
    );
    const acknowledgment = unwrap(
      retainOutboxArtifact(ledger.directory(), "acknowledgment", Buffer.from("acknowledged")),
    );
    const requestEnvelope = readFileSync(join(ledger.directory(), request.ref), "utf-8");
    const acknowledgmentEnvelope = readFileSync(
      join(ledger.directory(), acknowledgment.ref),
      "utf-8",
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
    ledger.append({
      kind: "outbox-delivery-recorded",
      delivery: {
        id,
        state: "acknowledged",
        because: "response retained",
        derivation: derivation.gate("outbox", "runner@0", "runner"),
        acknowledgment,
      },
    });
    expect(ledger.readOutboxEvidence(node, "other", id)).toEqual({ kind: "absent" });
    expect(ledger.readOutboxEvidence({ graph: "fixture", id: "other" }, "s1", id)).toEqual({
      kind: "absent",
    });
    expect(ledger.readOutboxEvidence(node, "s1", "c".repeat(64))).toEqual({ kind: "absent" });
    expect(ledger.readOutboxEvidence(node, "s1", id)).toEqual(
      expect.objectContaining({
        kind: "verified",
        request: Buffer.from("request"),
        acknowledgment: Buffer.from("acknowledged"),
      }),
    );
    unlinkSync(join(ledger.directory(), request.ref));
    expect(ledger.readOutboxEvidence(node, "s1", id)).toEqual({
      kind: "missing",
      ref: request.ref,
    });
    writeFileSync(join(ledger.directory(), request.ref), requestEnvelope);
    writeFileSync(join(ledger.directory(), request.ref), "not json");
    expect(ledger.readOutboxEvidence(node, "s1", id)).toEqual({
      kind: "corrupt",
      ref: request.ref,
    });
    writeFileSync(join(ledger.directory(), request.ref), requestEnvelope);
    writeFileSync(join(ledger.directory(), request.ref), "{}");
    expect(ledger.readOutboxEvidence(node, "s1", id)).toEqual({
      kind: "corrupt",
      ref: request.ref,
    });
    writeFileSync(join(ledger.directory(), request.ref), requestEnvelope);
    unlinkSync(join(ledger.directory(), acknowledgment.ref));
    expect(ledger.readOutboxEvidence(node, "s1", id)).toEqual({
      kind: "missing",
      ref: acknowledgment.ref,
    });
    writeFileSync(join(ledger.directory(), acknowledgment.ref), "not json");
    expect(ledger.readOutboxEvidence(node, "s1", id)).toEqual({
      kind: "corrupt",
      ref: acknowledgment.ref,
    });
    writeFileSync(join(ledger.directory(), acknowledgment.ref), "{}");
    expect(ledger.readOutboxEvidence(node, "s1", id)).toEqual({
      kind: "corrupt",
      ref: acknowledgment.ref,
    });
    writeFileSync(join(ledger.directory(), acknowledgment.ref), acknowledgmentEnvelope);
    expect(ledger.readOutboxEvidence(node, "s1", id)).toEqual(
      expect.objectContaining({ kind: "verified", acknowledgment: Buffer.from("acknowledged") }),
    );
  });

  it("round-trips binary and empty bytes, and refuses mismatched or unsafe artifact references", () => {
    directory = mkdtempSync(join(runsRoot, "outbox-"));
    const binary = Buffer.from([0, 255, 0, 254]);
    const kinds: readonly ("request" | "acknowledgment")[] = ["request", "acknowledgment"];
    const bodies: readonly Buffer[] = [binary, Buffer.alloc(0)];
    for (const kind of kinds) {
      for (const body of bodies) {
        const retained = unwrap(retainOutboxArtifact(directory, kind, body));
        expect(unwrap(readOutboxArtifact(directory, retained))).toEqual(body);
      }
    }
    const retained = unwrap(retainOutboxArtifact(directory, "request", binary));
    expect(readOutboxArtifact(directory, { ...retained, sha256: "a".repeat(64) })).toEqual(
      expect.objectContaining({
        _tag: "Err",
        error: expect.objectContaining({ kind: "corrupt" }),
      }),
    );
    expect(readOutboxArtifact(directory, { ...retained, bytes: retained.bytes + 1 })).toEqual(
      expect.objectContaining({
        _tag: "Err",
        error: expect.objectContaining({ kind: "corrupt" }),
      }),
    );
    expect(
      readOutboxArtifact(directory, { ...retained, ref: "outbox/request/../../journal.jsonl" }),
    ).toEqual(
      expect.objectContaining({
        _tag: "Err",
        error: expect.objectContaining({ kind: "corrupt" }),
      }),
    );
  });

  it("refuses conflicting content without overwrite and classifies directory creation failure as write", () => {
    directory = mkdtempSync(join(runsRoot, "outbox-"));
    const raw = Buffer.from("original");
    const retained = unwrap(retainOutboxArtifact(directory, "request", raw));
    writeFileSync(join(directory, retained.ref), "conflicting envelope");
    expect(retainOutboxArtifact(directory, "request", raw)).toEqual(
      expect.objectContaining({ _tag: "Err", error: { kind: "corrupt", ref: retained.ref } }),
    );
    expect(readFileSync(join(directory, retained.ref), "utf-8")).toBe("conflicting envelope");
    const blocked = join(directory, "blocked");
    writeFileSync(blocked, "not a directory");
    expect(retainOutboxArtifact(blocked, "request", Buffer.from("request"))).toEqual(
      expect.objectContaining({ _tag: "Err", error: expect.objectContaining({ kind: "write" }) }),
    );
  });
});

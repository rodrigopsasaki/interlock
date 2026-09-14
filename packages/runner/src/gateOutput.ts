import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import { sharedJournalDirectory } from "face";
import { isRecord, isString, prop } from "./validate.ts";

export const GATE_OUTPUT_SHAPE = "gate-output@v0";

interface GateOutputStreamReference {
  readonly sha256: string;
  readonly bytes: number;
  readonly artifact: string;
}

export interface GateOutputReference {
  readonly interlock: typeof GATE_OUTPUT_SHAPE;
  readonly stdout: GateOutputStreamReference;
  readonly stderr: GateOutputStreamReference;
}

export type GateOutputRefusal =
  | { readonly kind: "invalid-reference" }
  | { readonly kind: "missing"; readonly artifact: string }
  | {
      readonly kind: "corrupt";
      readonly artifact: string;
      readonly expectedSha256: string;
      readonly actualSha256: string;
      readonly expectedBytes: number;
      readonly actualBytes: number;
    }
  | { readonly kind: "storage"; readonly operation: string; readonly reason: string };

export type GateOutputRead =
  | { readonly kind: "absent" }
  | { readonly kind: "available"; readonly stdout: Buffer; readonly stderr: Buffer };

function outputHash(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function artifactFor(hash: string): string {
  return ["gate-output", "sha256", hash].join("/");
}

function pathFor(journalDirectory: string, artifact: string): string {
  return join(journalDirectory, ...artifact.split("/"));
}

function streamReference(bytes: Buffer): GateOutputStreamReference {
  const sha256 = outputHash(bytes);
  return { sha256, bytes: bytes.length, artifact: artifactFor(sha256) };
}

function storageRefusal(operation: string, cause: unknown): GateOutputRefusal {
  return {
    kind: "storage",
    operation,
    reason: cause instanceof Error ? cause.message : "unknown filesystem failure",
  };
}

async function removeTemporary(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    return;
  }
}

async function storeStream(
  journalDirectory: string,
  reference: GateOutputStreamReference,
  bytes: Buffer,
): Promise<Result<void, GateOutputRefusal>> {
  const artifact = pathFor(journalDirectory, reference.artifact);
  const temporary = `${artifact}.${randomUUID()}.partial`;
  try {
    await mkdir(join(journalDirectory, "gate-output", "sha256"), { recursive: true });
    await writeFile(temporary, bytes, { flag: "wx" });
    try {
      await link(temporary, artifact);
    } catch (cause) {
      const existing = await readFile(artifact).catch(() => undefined);
      if (existing === undefined || !existing.equals(bytes)) {
        await removeTemporary(temporary);
        return err(storageRefusal("store immutable gate output", cause));
      }
    }
    await removeTemporary(temporary);
    return ok(undefined);
  } catch (cause) {
    await removeTemporary(temporary);
    return err(storageRefusal("store immutable gate output", cause));
  }
}

export async function storeGateOutput(
  journalDirectory: string,
  stdout: Buffer,
  stderr: Buffer,
): Promise<Result<GateOutputReference, GateOutputRefusal>> {
  const reference: GateOutputReference = {
    interlock: GATE_OUTPUT_SHAPE,
    stdout: streamReference(stdout),
    stderr: streamReference(stderr),
  };
  const stdoutStored = await storeStream(journalDirectory, reference.stdout, stdout);
  if (isErr(stdoutStored)) return err(stdoutStored.error);
  const stderrStored = await storeStream(journalDirectory, reference.stderr, stderr);
  if (isErr(stderrStored)) return err(stderrStored.error);
  return ok(reference);
}

export async function retainGateOutput(
  worktree: string,
  stdout: Buffer,
  stderr: Buffer,
): Promise<Result<GateOutputReference, GateOutputRefusal>> {
  try {
    return await storeGateOutput(sharedJournalDirectory(worktree), stdout, stderr);
  } catch (cause) {
    return err(storageRefusal("resolve shared journal", cause));
  }
}

function isStreamReference(value: unknown): value is GateOutputStreamReference {
  if (!isRecord(value)) return false;
  const sha256 = prop(value, "sha256");
  const bytes = prop(value, "bytes");
  const artifact = prop(value, "artifact");
  return (
    isString(sha256) &&
    /^[a-f0-9]{64}$/.test(sha256) &&
    typeof bytes === "number" &&
    Number.isSafeInteger(bytes) &&
    bytes >= 0 &&
    isString(artifact) &&
    artifact === artifactFor(sha256)
  );
}

export function gateOutputReference(
  proof: Readonly<Record<string, unknown>>,
): Result<GateOutputReference | undefined, GateOutputRefusal> {
  const candidate = proof["gateOutput"];
  if (candidate === undefined) return ok(undefined);
  if (!isRecord(candidate)) return err({ kind: "invalid-reference" });
  const interlock = prop(candidate, "interlock");
  const stdout = prop(candidate, "stdout");
  const stderr = prop(candidate, "stderr");
  if (interlock !== GATE_OUTPUT_SHAPE || !isStreamReference(stdout) || !isStreamReference(stderr)) {
    return err({ kind: "invalid-reference" });
  }
  return ok({ interlock, stdout, stderr });
}

async function readStream(
  journalDirectory: string,
  reference: GateOutputStreamReference,
): Promise<Result<Buffer, GateOutputRefusal>> {
  const artifact = pathFor(journalDirectory, reference.artifact);
  let bytes: Buffer;
  try {
    bytes = await readFile(artifact);
  } catch {
    return err({ kind: "missing", artifact: reference.artifact });
  }
  const actualSha256 = outputHash(bytes);
  if (actualSha256 !== reference.sha256 || bytes.length !== reference.bytes) {
    return err({
      kind: "corrupt",
      artifact: reference.artifact,
      expectedSha256: reference.sha256,
      actualSha256,
      expectedBytes: reference.bytes,
      actualBytes: bytes.length,
    });
  }
  return ok(bytes);
}

export async function readGateOutput(
  journalDirectory: string,
  proof: Readonly<Record<string, unknown>>,
): Promise<Result<GateOutputRead, GateOutputRefusal>> {
  const reference = gateOutputReference(proof);
  if (isErr(reference)) return reference;
  if (reference.value === undefined) return ok({ kind: "absent" });
  const stdout = await readStream(journalDirectory, reference.value.stdout);
  if (isErr(stdout)) return stdout;
  const stderr = await readStream(journalDirectory, reference.value.stderr);
  if (isErr(stderr)) return stderr;
  return ok({ kind: "available", stdout: stdout.value, stderr: stderr.value });
}

export function explainGateOutputRefusal(refusal: GateOutputRefusal): string {
  switch (refusal.kind) {
    case "invalid-reference":
      return "gate output reference is not a valid gate-output@v0 envelope.";
    case "missing":
      return `${refusal.artifact}: retained gate output is missing.`;
    case "corrupt":
      return `${refusal.artifact}: retained gate output does not match its receipt reference.`;
    case "storage":
      return `${refusal.operation}: ${refusal.reason}`;
  }
}

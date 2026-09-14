import { createHash } from "node:crypto";
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import type { Derivation } from "./derivation.ts";
import { isDerivation } from "./derivation.ts";
import type { Node } from "./graph.ts";
import { isNode } from "./graph.ts";
import { isRecord, isString, prop } from "./validate.ts";

export const OUTBOX_INTENT_SHAPE = "outbox-intent@v0";
export const OUTBOX_ARTIFACT_SHAPE = "outbox-artifact@v0";

export interface OutboxArtifact {
  readonly interlock: typeof OUTBOX_ARTIFACT_SHAPE;
  readonly sha256: string;
  readonly bytes: number;
  readonly ref: string;
}

export interface OutboxRepository {
  readonly owner: string;
  readonly name: string;
  readonly originUrl: string;
}

export interface OutboxIntent {
  readonly interlock: typeof OUTBOX_INTENT_SHAPE;
  readonly id: string;
  readonly node: Node;
  readonly session: string;
  readonly target: string;
  readonly repository?: OutboxRepository;
  readonly request: OutboxArtifact;
  readonly derivation: Derivation;
}

export interface OutboxDelivery {
  readonly id: string;
  readonly state: "acknowledged" | "uncertain";
  readonly because: string;
  readonly derivation: Derivation;
  readonly acknowledgment?: OutboxArtifact;
}

interface ArtifactEnvelope {
  readonly interlock: typeof OUTBOX_ARTIFACT_SHAPE;
  readonly sha256: string;
  readonly bytes: number;
  readonly body: string;
}

export type OutboxArtifactRefusal =
  | { readonly kind: "missing"; readonly ref: string }
  | { readonly kind: "corrupt"; readonly ref: string }
  | { readonly kind: "write"; readonly because: string };

function hash(raw: Uint8Array): string {
  return createHash("sha256").update(raw).digest("hex");
}

function artifactPath(directory: string, ref: string): string {
  return join(directory, ...ref.split("/"));
}

function kindForRef(ref: string): "request" | "acknowledgment" | undefined {
  const matched = /^outbox\/(request|acknowledgment)\/[a-f0-9]{64}\.json$/.exec(ref);
  return matched?.[1] === "request" || matched?.[1] === "acknowledgment" ? matched[1] : undefined;
}

export function isOutboxArtifact(value: unknown): value is OutboxArtifact {
  const ref = isRecord(value) ? prop(value, "ref") : undefined;
  const sha256 = isRecord(value) ? prop(value, "sha256") : undefined;
  return (
    isRecord(value) &&
    prop(value, "interlock") === OUTBOX_ARTIFACT_SHAPE &&
    isString(sha256) &&
    typeof prop(value, "bytes") === "number" &&
    isString(ref) &&
    kindForRef(ref) !== undefined &&
    ref.endsWith(`/${sha256}.json`)
  );
}

function isOutboxRepository(value: unknown): value is OutboxRepository {
  return (
    isRecord(value) &&
    isString(prop(value, "owner")) &&
    isString(prop(value, "name")) &&
    isString(prop(value, "originUrl"))
  );
}

export function isOutboxIntent(value: unknown): value is OutboxIntent {
  const repository = isRecord(value) ? prop(value, "repository") : undefined;
  return (
    isRecord(value) &&
    prop(value, "interlock") === OUTBOX_INTENT_SHAPE &&
    isString(prop(value, "id")) &&
    isNode(prop(value, "node")) &&
    isString(prop(value, "session")) &&
    isString(prop(value, "target")) &&
    (repository === undefined || isOutboxRepository(repository)) &&
    isOutboxArtifact(prop(value, "request")) &&
    isDerivation(prop(value, "derivation"))
  );
}

export function isOutboxDelivery(value: unknown): value is OutboxDelivery {
  const acknowledgment = isRecord(value) ? prop(value, "acknowledgment") : undefined;
  const state = isRecord(value) ? prop(value, "state") : undefined;
  return (
    isRecord(value) &&
    isString(prop(value, "id")) &&
    (state === "acknowledged" || state === "uncertain") &&
    isString(prop(value, "because")) &&
    isDerivation(prop(value, "derivation")) &&
    (acknowledgment === undefined || isOutboxArtifact(acknowledgment))
  );
}

function refusal(
  kind: OutboxArtifactRefusal["kind"],
  ref: string,
  error?: unknown,
): OutboxArtifactRefusal {
  if (kind !== "write") return { kind, ref };
  return {
    kind,
    because: error instanceof Error ? error.message : "artifact write failed",
  };
}

export function retainOutboxArtifact(
  directory: string,
  kind: "request" | "acknowledgment",
  raw: Uint8Array,
): Result<OutboxArtifact, OutboxArtifactRefusal> {
  const sha256 = hash(raw);
  const ref = `outbox/${kind}/${sha256}.json`;
  const path = artifactPath(directory, ref);
  mkdirSync(join(directory, "outbox", kind), { recursive: true });
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, "wx");
    writeFileSync(
      descriptor,
      JSON.stringify({
        interlock: OUTBOX_ARTIFACT_SHAPE,
        sha256,
        bytes: raw.byteLength,
        body: Buffer.from(raw).toString("base64"),
      }),
    );
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    if (!isAlreadyExists(error)) return err(refusal("write", ref, error));
    const existing = readOutboxArtifact(directory, {
      interlock: OUTBOX_ARTIFACT_SHAPE,
      sha256,
      bytes: raw.byteLength,
      ref,
    });
    if (isErr(existing) || !existing.value.equals(Buffer.from(raw)))
      return err(refusal("corrupt", ref));
  }
  return ok({ interlock: OUTBOX_ARTIFACT_SHAPE, sha256, bytes: raw.byteLength, ref });
}

export function readOutboxArtifact(
  directory: string,
  artifact: OutboxArtifact,
): Result<Buffer, OutboxArtifactRefusal> {
  const kind = kindForRef(artifact.ref);
  if (kind === undefined || artifact.ref !== `outbox/${kind}/${artifact.sha256}.json`) {
    return err(refusal("corrupt", artifact.ref));
  }
  let raw: Buffer;
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(artifactPath(directory, artifact.ref), "utf-8"),
    );
    if (!isArtifactEnvelope(parsed)) return err(refusal("corrupt", artifact.ref));
    raw = Buffer.from(parsed.body, "base64");
    if (parsed.sha256 !== artifact.sha256 || parsed.bytes !== artifact.bytes) {
      return err(refusal("corrupt", artifact.ref));
    }
  } catch {
    return err(refusal("missing", artifact.ref));
  }
  return raw.byteLength === artifact.bytes && hash(raw) === artifact.sha256
    ? ok(raw)
    : err(refusal("corrupt", artifact.ref));
}

function isArtifactEnvelope(value: unknown): value is ArtifactEnvelope {
  return (
    isRecord(value) &&
    prop(value, "interlock") === OUTBOX_ARTIFACT_SHAPE &&
    isString(prop(value, "sha256")) &&
    typeof prop(value, "bytes") === "number" &&
    isString(prop(value, "body"))
  );
}

function isAlreadyExists(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

import { createHash, type Hash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import { type Derivation, isDerivation } from "./derivation.ts";
import { isSpend, type Spend } from "./spend.ts";
import { isRecord, isString, prop } from "./validate.ts";

export type Duration =
  | { readonly kind: "measured"; readonly ms: number }
  | { readonly kind: "unknown" };

export const duration = {
  measured: (ms: number): Duration => ({ kind: "measured", ms }),
  unknown: (): Duration => ({ kind: "unknown" }),
};

export function isDuration(value: unknown): value is Duration {
  if (!isRecord(value)) return false;
  const kind = prop(value, "kind");
  if (typeof kind !== "string") return false;
  switch (kind) {
    case "measured":
      return typeof prop(value, "ms") === "number";
    case "unknown":
      return true;
    default:
      return false;
  }
}

export interface Receipt {
  readonly id: string;
  readonly gate: string;
  readonly commitSha: string;
  readonly spend: Spend;
  readonly duration: Duration;
  readonly derivation: Derivation;
  readonly proof: Readonly<Record<string, unknown>>;
}

export const COMMAND_RECEIPT_ID_VERSION = "command-proof@v1";

export type ReceiptRunAssessment =
  | { readonly kind: "not-recorded" }
  | { readonly kind: "satisfied" }
  | { readonly kind: "failed"; readonly because: string };

export type ScopeEntry =
  | { readonly kind: "file"; readonly path: string }
  | { readonly kind: "gitlink"; readonly path: string; readonly commit: string };

export type ScopeInput = readonly ScopeEntry[] | readonly string[];

export const scopeEntry = {
  file: (path: string): ScopeEntry => ({ kind: "file", path }),
  gitlink: (path: string, commit: string): ScopeEntry => ({ kind: "gitlink", path, commit }),
};

export function fileScope(paths: readonly string[]): readonly ScopeEntry[] {
  return paths.map(scopeEntry.file);
}

export type ScopeRefusal =
  | { readonly kind: "gate-contains-nul"; readonly gate: string }
  | { readonly kind: "unreadable"; readonly path: string }
  | { readonly kind: "absolute-path"; readonly path: string }
  | {
      readonly kind: "escapes-root";
      readonly root: string;
      readonly path: string;
    };

export function explainScopeRefusal(refusal: ScopeRefusal): string {
  switch (refusal.kind) {
    case "gate-contains-nul":
      return explainGateIdNul(refusal.gate);
    case "unreadable":
      return `${refusal.path}: scope file could not be read.`;
    case "absolute-path":
      return `${refusal.path}: scope paths are relative to the repository root, never absolute.`;
    case "escapes-root":
      return `${refusal.path}: resolves outside repository root ${refusal.root}.`;
  }
}

function toPosixPath(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/");
}

function resolveScopePath(root: string, path: string): Result<string, ScopeRefusal> {
  if (isAbsolute(path)) return err({ kind: "absolute-path", path });
  const resolved = resolve(root, path);
  const fromRoot = relative(root, resolved);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    return err({ kind: "escapes-root", root, path });
  }
  return ok(resolved);
}

export function explainGateIdNul(gate: string): string {
  return `${JSON.stringify(gate)}: a gate id may not contain a NUL byte.`;
}

export function gateIdHasNul(gate: string): boolean {
  return gate.includes("\u0000");
}

function frameLength(length: number): Buffer {
  const framed = Buffer.alloc(8);
  framed.writeBigUInt64BE(BigInt(length));
  return framed;
}

function updateFramed(hash: Hash, content: Uint8Array): void {
  hash.update(frameLength(content.length));
  hash.update(content);
}

function byPath(left: ScopeEntry, right: ScopeEntry): number {
  if (left.path < right.path) return -1;
  return left.path > right.path ? 1 : 0;
}

function scopeEntries(input: ScopeInput): readonly ScopeEntry[] {
  return input.map((entry) => (typeof entry === "string" ? scopeEntry.file(entry) : entry));
}

export async function receiptId(
  root: string,
  input: ScopeInput,
  gate: string,
): Promise<Result<string, ScopeRefusal>> {
  if (gateIdHasNul(gate)) return err({ kind: "gate-contains-nul", gate });
  const entries = scopeEntries(input);
  const sorted = [...entries].sort(byPath);
  const hash = createHash("sha256");
  const framed = sorted.some((entry) => entry.kind === "gitlink");
  if (framed) {
    hash.update(Buffer.from([0]));
    updateFramed(hash, Buffer.from(gate));
  } else {
    hash.update(gate);
  }
  for (const entry of sorted) {
    const resolved = resolveScopePath(root, entry.path);
    if (isErr(resolved)) return resolved;
    const path = Buffer.from(toPosixPath(entry.path));
    if (!framed) {
      hash.update(path);
      try {
        hash.update(await readFile(resolved.value));
      } catch {
        return err({ kind: "unreadable", path: entry.path });
      }
      continue;
    }
    let content: Buffer;
    try {
      content =
        entry.kind === "gitlink" ? Buffer.from(entry.commit) : await readFile(resolved.value);
    } catch {
      return err({ kind: "unreadable", path: entry.path });
    }
    hash.update(Buffer.from(entry.kind === "gitlink" ? "g" : "f"));
    updateFramed(hash, path);
    updateFramed(hash, content);
  }
  return ok(hash.digest("hex"));
}

export async function commandReceiptId(
  root: string,
  input: ScopeInput,
  gate: string,
  proof: Readonly<Record<string, unknown>>,
): Promise<Result<string, ScopeRefusal>> {
  const contentId = await receiptId(root, input, gate);
  if (isErr(contentId)) return contentId;
  const hash = createHash("sha256");
  hash.update(COMMAND_RECEIPT_ID_VERSION);
  hash.update("\u0000");
  hash.update(contentId.value);
  hash.update("\u0000");
  hash.update(JSON.stringify(proof));
  return ok(hash.digest("hex"));
}

export function assessReceipt(receipt: Receipt): ReceiptRunAssessment {
  if (receipt.derivation.kind !== "gate") return { kind: "not-recorded" };
  const exitCode = receipt.proof["exitCode"];
  if (typeof exitCode !== "number" || !Number.isSafeInteger(exitCode)) {
    return { kind: "not-recorded" };
  }
  const outputMatched = receipt.proof["outputMatched"];
  if (outputMatched !== undefined && typeof outputMatched !== "boolean") {
    return { kind: "not-recorded" };
  }
  if (exitCode !== 0) return { kind: "failed", because: `exit ${exitCode}` };
  if (outputMatched === false) {
    const pattern = receipt.proof["pattern"];
    return {
      kind: "failed",
      because:
        typeof pattern === "string"
          ? `output did not match /${pattern}/`
          : "output did not match the gate criterion",
    };
  }
  return { kind: "satisfied" };
}

export async function createReceipt(
  root: string,
  entries: ScopeInput,
  gate: string,
  commitSha: string,
  spend: Spend,
  duration: Duration,
  derivation: Derivation,
  proof: Readonly<Record<string, unknown>>,
): Promise<Result<Receipt, ScopeRefusal>> {
  const id = await receiptId(root, entries, gate);
  if (isErr(id)) return id;
  return ok({
    id: id.value,
    gate,
    commitSha,
    spend,
    duration,
    derivation,
    proof,
  });
}

export function isReceipt(value: unknown): value is Receipt {
  return (
    isRecord(value) &&
    isString(prop(value, "id")) &&
    isString(prop(value, "gate")) &&
    isString(prop(value, "commitSha")) &&
    isSpend(prop(value, "spend")) &&
    isDuration(prop(value, "duration")) &&
    isDerivation(prop(value, "derivation")) &&
    isRecord(prop(value, "proof"))
  );
}

export interface Stale {
  readonly receipt: Receipt;
  readonly recomputedId: string;
}

export async function checkStale(
  receipt: Receipt,
  root: string,
  entries: ScopeInput,
): Promise<Result<Stale | undefined, ScopeRefusal>> {
  const recomputedId = await receiptId(root, entries, receipt.gate);
  if (isErr(recomputedId)) return recomputedId;
  return ok(
    recomputedId.value === receipt.id ? undefined : { receipt, recomputedId: recomputedId.value },
  );
}

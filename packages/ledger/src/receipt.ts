import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import { isDerivation, type Derivation } from "./derivation.ts";
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

// A receipt is addressed by the content of the paths in its scope, never by where the
// repository checking them out happens to live. Every scope path is given relative to
// `root`; an absolute path, or one that resolves outside `root`, is a refusal, not a hash.
export type ScopeRefusal =
  | { readonly kind: "absolute-path"; readonly path: string }
  | {
      readonly kind: "escapes-root";
      readonly root: string;
      readonly path: string;
    };

export function explainScopeRefusal(refusal: ScopeRefusal): string {
  switch (refusal.kind) {
    case "absolute-path":
      return `${refusal.path}: scope paths are relative to the repository root, never absolute.`;
    case "escapes-root":
      return `${refusal.path}: resolves outside repository root ${refusal.root}.`;
  }
}

function toPosixPath(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/");
}

function resolveScopePath(
  root: string,
  path: string,
): Result<string, ScopeRefusal> {
  if (isAbsolute(path)) return err({ kind: "absolute-path", path });
  const resolved = resolve(root, path);
  const fromRoot = relative(root, resolved);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    return err({ kind: "escapes-root", root, path });
  }
  return ok(resolved);
}

export async function receiptId(
  root: string,
  paths: readonly string[],
  gate: string,
): Promise<Result<string, ScopeRefusal>> {
  const hash = createHash("sha256");
  hash.update(gate);
  for (const path of [...paths].sort()) {
    const resolved = resolveScopePath(root, path);
    if (isErr(resolved)) return resolved;
    hash.update(toPosixPath(path));
    hash.update(await readFile(resolved.value));
  }
  return ok(hash.digest("hex"));
}

export async function createReceipt(
  root: string,
  paths: readonly string[],
  gate: string,
  commitSha: string,
  spend: Spend,
  duration: Duration,
  derivation: Derivation,
  proof: Readonly<Record<string, unknown>>,
): Promise<Result<Receipt, ScopeRefusal>> {
  const id = await receiptId(root, paths, gate);
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
  paths: readonly string[],
): Promise<Result<Stale | undefined, ScopeRefusal>> {
  const recomputedId = await receiptId(root, paths, receipt.gate);
  if (isErr(recomputedId)) return recomputedId;
  return ok(
    recomputedId.value === receipt.id
      ? undefined
      : { receipt, recomputedId: recomputedId.value },
  );
}

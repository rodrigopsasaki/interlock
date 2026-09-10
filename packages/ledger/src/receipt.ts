import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
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

export async function receiptId(
  scope: readonly string[],
  gate: string,
): Promise<string> {
  const hash = createHash("sha256");
  hash.update(gate);
  for (const path of [...scope].sort()) {
    hash.update(path);
    hash.update(await readFile(path));
  }
  return hash.digest("hex");
}

export async function createReceipt(
  scope: readonly string[],
  gate: string,
  commitSha: string,
  spend: Spend,
  duration: Duration,
  derivation: Derivation,
  proof: Readonly<Record<string, unknown>>,
): Promise<Receipt> {
  const id = await receiptId(scope, gate);
  return { id, gate, commitSha, spend, duration, derivation, proof };
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
  scope: readonly string[],
): Promise<Stale | undefined> {
  const recomputedId = await receiptId(scope, receipt.gate);
  return recomputedId === receipt.id ? undefined : { receipt, recomputedId };
}

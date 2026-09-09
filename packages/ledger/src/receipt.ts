import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isDerivation, type Derivation } from "./derivation.js";
import { isSpend, type Spend } from "./spend.js";
import { isRecord, isString, prop } from "./validate.js";

export interface Receipt {
  readonly id: string;
  readonly gate: string;
  readonly commitSha: string;
  readonly spend: Spend;
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
  derivation: Derivation,
  proof: Readonly<Record<string, unknown>>,
): Promise<Receipt> {
  const id = await receiptId(scope, gate);
  return { id, gate, commitSha, spend, derivation, proof };
}

export function isReceipt(value: unknown): value is Receipt {
  return (
    isRecord(value) &&
    isString(prop(value, "id")) &&
    isString(prop(value, "gate")) &&
    isString(prop(value, "commitSha")) &&
    isSpend(prop(value, "spend")) &&
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

import { err, ok, type Result } from "@phyxiusjs/fp";
import type { Discovery } from "ledger";
import { isRecord, isString, prop } from "./validate.ts";

export function parseDiscovery(
  raw: unknown,
  index: number,
): Result<Discovery, string> {
  if (!isRecord(raw)) return err(`discovery ${index}: not a mapping`);

  const id = prop(raw, "id");
  if (!isString(id))
    return err(`discovery ${index}: "id" is missing or not a string`);

  const what = prop(raw, "what");
  if (!isString(what))
    return err(`discovery "${id}": "what" is missing or not a string`);

  const foundAt = prop(raw, "found_at");
  if (!isString(foundAt))
    return err(`discovery "${id}": "found_at" is missing or not a string`);

  const matteredBecause = prop(raw, "mattered_because");
  if (!isString(matteredBecause))
    return err(
      `discovery "${id}": "mattered_because" is missing or not a string`,
    );

  return ok({ id, what, foundAt, matteredBecause });
}

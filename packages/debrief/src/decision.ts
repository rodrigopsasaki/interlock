import { err, ok, type Result } from "@phyxiusjs/fp";
import type { Decision } from "ledger";
import { isRecord, isString, isStringArray, prop } from "./validate.ts";

export function parseDecision(raw: unknown, index: number): Result<Decision, string> {
  if (!isRecord(raw)) return err(`decision ${index}: not a mapping`);

  const id = prop(raw, "id");
  if (!isString(id)) return err(`decision ${index}: "id" is missing or not a string`);

  const what = prop(raw, "what");
  if (!isString(what)) return err(`decision "${id}": "what" is missing or not a string`);

  const because = prop(raw, "because");
  if (!isString(because)) return err(`decision "${id}": missing "because"`);

  const restsOn = prop(raw, "rests_on");
  if (!isStringArray(restsOn)) return err(`decision "${id}": "rests_on" must be a list of strings`);

  const hunks = prop(raw, "hunks");
  if (!isStringArray(hunks)) return err(`decision "${id}": "hunks" must be a list of strings`);

  const produces = prop(raw, "produces");
  if (produces !== undefined && !isStringArray(produces))
    return err(`decision "${id}": "produces" must be a list of strings`);

  const rejected = prop(raw, "rejected");
  if (rejected !== undefined && !isString(rejected))
    return err(`decision "${id}": "rejected" must be a string`);

  return ok({
    id,
    what,
    because,
    restsOn,
    hunks,
    ...(produces === undefined ? {} : { produces }),
    ...(rejected === undefined ? {} : { rejected }),
  });
}

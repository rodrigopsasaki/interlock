import { err, ok, type Result } from "@phyxiusjs/fp";
import type { GateRun } from "ledger";
import { isRecord, isString, prop } from "./validate.ts";

export function parseGateRun(raw: unknown, index: number): Result<GateRun, string> {
  if (!isRecord(raw)) return err(`gate run ${index}: not a mapping`);

  const id = prop(raw, "id");
  if (!isString(id)) return err(`gate run ${index}: "id" is missing or not a string`);

  const result = prop(raw, "result");
  if (result !== "pass" && result !== "fail")
    return err(`gate run "${id}": "result" must be "pass" or "fail"`);

  const invocation = prop(raw, "invocation");
  if (invocation !== undefined && !isString(invocation))
    return err(`gate run "${id}": "invocation" must be a string`);

  const note = prop(raw, "note");
  if (note !== undefined && !isString(note))
    return err(`gate run "${id}": "note" must be a string`);

  return ok({
    id,
    result,
    ...(invocation === undefined ? {} : { invocation }),
    ...(note === undefined ? {} : { note }),
  });
}

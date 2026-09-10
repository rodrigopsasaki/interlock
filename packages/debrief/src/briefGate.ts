import { err, ok, type Result } from "@phyxiusjs/fp";
import { isRecord, isString, prop } from "./validate.ts";

export interface BriefGate {
  readonly id: string;
  readonly kind: string;
  readonly run?: string;
  readonly expectOutput?: string;
}

export function parseBriefGate(
  raw: unknown,
  index: number,
): Result<BriefGate, string> {
  if (!isRecord(raw)) return err(`gates[${index}]: not a mapping`);

  const id = prop(raw, "id");
  if (!isString(id))
    return err(`gates[${index}]: "id" is missing or not a string`);

  const kind = prop(raw, "kind");
  if (!isString(kind))
    return err(`gates "${id}": "kind" is missing or not a string`);

  const run = prop(raw, "run");
  if (run !== undefined && !isString(run))
    return err(`gates "${id}": "run" must be a string`);

  const expectOutput = prop(raw, "expect_output");
  if (expectOutput !== undefined && !isString(expectOutput))
    return err(`gates "${id}": "expect_output" must be a string`);

  return ok({
    id,
    kind,
    ...(run === undefined ? {} : { run }),
    ...(expectOutput === undefined ? {} : { expectOutput }),
  });
}

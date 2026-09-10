import { err, ok, type Result } from "@phyxiusjs/fp";
import { isRecord, isString, prop } from "./validate.ts";

export interface BriefSubstrate {
  readonly address: string;
  readonly handle?: string;
}

export function parseBriefSubstrate(
  raw: unknown,
): Result<BriefSubstrate, string> {
  if (!isRecord(raw)) return err('"substrate" is missing or not a mapping');

  const address = prop(raw, "address");
  if (!isString(address))
    return err('"substrate.address" is missing or not a string');

  const handle = prop(raw, "handle");
  if (handle !== undefined && !isString(handle))
    return err('"substrate.handle" must be a string');

  return ok({ address, ...(handle === undefined ? {} : { handle }) });
}

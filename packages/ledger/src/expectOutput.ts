import { err, ok, type Result } from "@phyxiusjs/fp";

export function parseExpectOutput(source: string): Result<RegExp, string> {
  try {
    return ok(new RegExp(source));
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}

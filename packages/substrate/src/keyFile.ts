import { readFile } from "node:fs/promises";
import { err, ok, type Result } from "@phyxiusjs/fp";

// A missing file or an empty token is a refusal sentence at the first call, never a silent
// unauthenticated request.
export async function readBearerToken(
  path: string,
): Promise<Result<string, string>> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (error) {
    const because = error instanceof Error ? error.message : String(error);
    return err(`key file ${path}: ${because}`);
  }
  const firstLine = raw.split("\n")[0] ?? "";
  const token = firstLine.trim();
  if (token.length === 0) return err(`key file ${path}: first line is empty`);
  return ok(token);
}

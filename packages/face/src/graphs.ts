import { readdir } from "node:fs/promises";
import { join } from "node:path";

export async function listGraphIds(repoRoot: string): Promise<readonly string[]> {
  let entries: readonly string[];
  try {
    entries = await readdir(join(repoRoot, ".interlock", "graphs"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.endsWith(".yaml"))
    .map((entry) => entry.slice(0, -".yaml".length))
    .sort();
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

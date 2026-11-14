import { readFileSync } from "node:fs";
import { readFile as readFileAsync } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

type YamlMap = Readonly<Record<string, unknown>>;

function isYamlMap(value: unknown): value is YamlMap {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function storeDirFromModulesYaml(contents: string): string | undefined {
  let document: unknown;
  try {
    document = parseYaml(contents);
  } catch {
    return undefined;
  }
  if (!isYamlMap(document)) return undefined;
  const storeDir = document["storeDir"];
  return typeof storeDir === "string" && storeDir.trim().length > 0 ? storeDir : undefined;
}

export function recordedStoreDirSync(worktree: string): string | undefined {
  try {
    return storeDirFromModulesYaml(
      readFileSync(join(worktree, "node_modules", ".modules.yaml"), "utf8"),
    );
  } catch {
    return undefined;
  }
}

export async function recordedStoreDir(worktree: string): Promise<string | undefined> {
  try {
    return storeDirFromModulesYaml(
      await readFileAsync(join(worktree, "node_modules", ".modules.yaml"), "utf8"),
    );
  } catch {
    return undefined;
  }
}

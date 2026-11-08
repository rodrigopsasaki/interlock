import { isErr } from "@phyxiusjs/fp";
import { findRepoRoot } from "face";
import { parseFlag } from "../flags.ts";
import type { CommandResult } from "../main.ts";
import { migrateArcs } from "./migrate.ts";

export async function runArcsMigrate(args: readonly string[]): Promise<CommandResult> {
  const cwd = process.cwd();
  const repoRoot = findRepoRoot(cwd);
  if (repoRoot === undefined) {
    return {
      exitCode: 1,
      message: `${cwd}: no .interlock directory found in this directory or any parent; expected to run inside an interlock repository.`,
    };
  }
  const repository = parseFlag(args, "--repository");
  const result = await migrateArcs(repoRoot, repository);
  if (isErr(result)) return { exitCode: 1, message: result.error };
  return result.value.changed
    ? { exitCode: 0, message: `${repoRoot}/.interlock/arcs.yaml: migrated to arcs@v1.` }
    : { exitCode: 0, message: `${repoRoot}/.interlock/arcs.yaml: already arcs@v1; unchanged.` };
}

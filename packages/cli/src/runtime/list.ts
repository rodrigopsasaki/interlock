import { isErr } from "@phyxiusjs/fp";
import { findRepoRoot } from "face";
import {
  explainLocalConfigRefusal,
  explainMergeRuntimesRefusal,
  explainRuntimeCatalogueRefusal,
  type LocalConfig,
  loadLocalConfig,
  loadRuntimeCatalogue,
  mergeRuntimes,
  type ResolvedRuntime,
} from "runner";
import type { CommandResult } from "../main.ts";

function renderRuntime(runtime: ResolvedRuntime): string {
  const model = runtime.model ?? "(none)";
  return `${runtime.name} — kind ${runtime.kind}, model ${model}, source ${runtime.source}`;
}

export async function runRuntimeList(
  _args: readonly string[],
  options: { readonly cwd?: string } = {},
): Promise<CommandResult> {
  const cwd = options.cwd ?? process.cwd();
  const repoRoot = findRepoRoot(cwd);
  if (repoRoot === undefined) {
    return {
      exitCode: 1,
      message: `${cwd}: no .interlock directory found in this directory or any parent; expected to run inside an interlock repository.`,
    };
  }

  const catalogue = await loadRuntimeCatalogue();
  if (isErr(catalogue)) {
    return {
      exitCode: 1,
      message: explainRuntimeCatalogueRefusal(catalogue.error),
    };
  }

  const localResult = await loadLocalConfig(repoRoot);
  let local: LocalConfig | undefined;
  if (isErr(localResult)) {
    if (localResult.error.kind !== "missing") {
      return {
        exitCode: 1,
        message: explainLocalConfigRefusal(localResult.error),
      };
    }
  } else {
    local = localResult.value;
  }

  const merged = mergeRuntimes(catalogue.value, local);
  if (isErr(merged)) {
    return { exitCode: 1, message: explainMergeRuntimesRefusal(merged.error) };
  }

  const runtimes = [...merged.value.runtimes.values()];
  if (runtimes.length === 0) {
    return {
      exitCode: 0,
      message: "no runtimes declared; the catalogue is empty and local.yaml has no runtime block.",
    };
  }

  return { exitCode: 0, message: runtimes.map(renderRuntime).join("\n") };
}

import { buildRegistry, describeFileValidation, validateFile } from "schemas";
import type { CommandResult } from "../main.ts";

const USAGE =
  'interlock schema validate: expected a file path, e.g. "interlock schema validate .interlock/config.yaml".';

export async function runSchemaValidate(args: readonly string[]): Promise<CommandResult> {
  const path = args[0];
  if (path === undefined) return { exitCode: 1, message: USAGE };

  const registry = buildRegistry();
  const result = await validateFile(registry, path);
  return describeFileValidation(result);
}

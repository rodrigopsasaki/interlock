import {
  EXEC_ENVIRONMENT_PASSTHROUGH_CAPABILITY,
  EXEC_HEADLESS_ARGS_PROBE_CAPABILITY,
  EXEC_MCP_EXCLUSIVE_CAPABILITY,
  EXEC_PANE_INDEPENDENT_CAPABILITY,
  EXEC_WRITABLE_ROOTS_SLOT_CAPABILITY,
  PROBE_REAL_CHECKS_CAPABILITY,
  RUNTIMES_V2_CAPABILITY,
} from "runner";
import type { CommandResult } from "./main.ts";

export const CAPABILITIES_SHAPE = "capabilities@v0";

export const INTERLOCK_CAPABILITIES: readonly string[] = [
  EXEC_PANE_INDEPENDENT_CAPABILITY,
  EXEC_WRITABLE_ROOTS_SLOT_CAPABILITY,
  EXEC_MCP_EXCLUSIVE_CAPABILITY,
  EXEC_ENVIRONMENT_PASSTHROUGH_CAPABILITY,
  EXEC_HEADLESS_ARGS_PROBE_CAPABILITY,
  PROBE_REAL_CHECKS_CAPABILITY,
  RUNTIMES_V2_CAPABILITY,
];

export function runCapabilities(args: readonly string[]): CommandResult {
  if (args.includes("--json")) {
    return {
      exitCode: 0,
      message: JSON.stringify({
        interlock: CAPABILITIES_SHAPE,
        capabilities: INTERLOCK_CAPABILITIES,
      }),
    };
  }
  return { exitCode: 0, message: INTERLOCK_CAPABILITIES.join("\n") };
}

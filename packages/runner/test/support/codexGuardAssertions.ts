import {
  cleanupCodexLaunches,
  cleanupCodexLaunchesSync,
  platformProcessTable,
  registeredLaunches,
} from "./codexSupervisor.ts";

export function registeredGuardLaunchCount(): number {
  const registry = process.env["INTERLOCK_CODEX_GUARD_REGISTRY"];
  return registry === undefined ? 0 : registeredLaunches(registry).length;
}

export async function reapRegisteredGuardLaunches(): Promise<void> {
  const registry = process.env["INTERLOCK_CODEX_GUARD_REGISTRY"];
  if (registry !== undefined) await cleanupCodexLaunches(registry, platformProcessTable());
}

export function reapRegisteredGuardLaunchesSync(): void {
  const registry = process.env["INTERLOCK_CODEX_GUARD_REGISTRY"];
  if (registry !== undefined) cleanupCodexLaunchesSync(registry, platformProcessTable());
}

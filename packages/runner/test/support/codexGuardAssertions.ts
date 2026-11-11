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
  if (registry === undefined) return;
  await new Promise<void>((resolve) => setTimeout(resolve, 1000));
  const table = platformProcessTable();
  const before = table.list();
  const survivors = await cleanupCodexLaunches(registry, table);
  if (survivors.length > 0)
    throw new Error(
      `Codex launch survivors: ${survivors
        .map((pid) => `${String(pid)} (${before.find((entry) => entry.pid === pid)?.command ?? "unknown"})`)
        .join(", ")}`,
    );
}

export function reapRegisteredGuardLaunchesSync(): void {
  const registry = process.env["INTERLOCK_CODEX_GUARD_REGISTRY"];
  if (registry === undefined) return;
  const table = platformProcessTable();
  const before = table.list();
  const survivors = cleanupCodexLaunchesSync(registry, table);
  if (survivors.length > 0)
    throw new Error(
      `Codex launch survivors: ${survivors
        .map((pid) => `${String(pid)} (${before.find((entry) => entry.pid === pid)?.command ?? "unknown"})`)
        .join(", ")}`,
    );
}

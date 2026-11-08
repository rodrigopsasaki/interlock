import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";

const LOCK_NAME = ".cite-spend.lock";

interface LockRecord {
  readonly pid: number;
  readonly at: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLockRecord(value: unknown): value is LockRecord {
  return isRecord(value) && typeof value["pid"] === "number" && typeof value["at"] === "number";
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

async function acquire(directory: string): Promise<string> {
  await mkdir(directory, { recursive: true });
  const path = join(directory, LOCK_NAME);
  while (true) {
    try {
      const handle = await open(path, "wx");
      try {
        await handle.writeFile(JSON.stringify({ pid: process.pid, at: Date.now() }));
        await handle.sync();
      } finally {
        await handle.close();
      }
      return path;
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
      let record: unknown;
      try {
        record = JSON.parse(await readFile(path, "utf8"));
      } catch {
        record = undefined;
      }
      if (!isLockRecord(record) || !isAlive(record.pid)) {
        try {
          await unlink(path);
        } catch (unlinkError) {
          if (
            !(unlinkError instanceof Error) ||
            !("code" in unlinkError) ||
            unlinkError.code !== "ENOENT"
          ) {
            throw unlinkError;
          }
        }
        continue;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
    }
  }
}

export async function withDelegationLock<T>(
  directory: string,
  operation: () => Promise<T>,
): Promise<T> {
  const path = await acquire(directory);
  try {
    return await operation();
  } finally {
    await unlink(path).catch((error: unknown) => {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
        throw error;
      }
    });
  }
}

export async function pauseAfterDelegationCheck(): Promise<void> {
  const raw = process.env["INTERLOCK_CITE_PAUSE_AFTER_CHECK_MS"];
  const milliseconds = raw === undefined ? 0 : Number(raw);
  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

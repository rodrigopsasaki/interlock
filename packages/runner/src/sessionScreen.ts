import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export function screenPath(
  worktreePath: string,
  graph: string,
  node: string,
): string {
  return join(
    worktreePath,
    ".interlock",
    "sessions",
    graph,
    node,
    "screen.txt",
  );
}

export function lastNonEmptyLine(text: string): string | undefined {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  return lines.at(-1);
}

// Best-effort: the screen is narrated either way, so a write failure here never blocks judgement.
export async function writeScreenSnapshot(
  worktreePath: string,
  graph: string,
  node: string,
  text: string,
): Promise<void> {
  const destination = screenPath(worktreePath, graph, node);
  try {
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, text, "utf-8");
  } catch {
    return;
  }
}

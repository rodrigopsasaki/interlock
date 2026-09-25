import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export function screenPath(runnerStateDirectory: string, graph: string, node: string): string {
  return join(runnerStateDirectory, "session-screen", graph, node, "screen.txt");
}

export function lastNonEmptyLine(text: string): string | undefined {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  return lines.at(-1);
}

export async function writeScreenSnapshot(
  runnerStateDirectory: string,
  graph: string,
  node: string,
  text: string,
): Promise<void> {
  const destination = screenPath(runnerStateDirectory, graph, node);
  try {
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, text, "utf-8");
  } catch {
    return;
  }
}

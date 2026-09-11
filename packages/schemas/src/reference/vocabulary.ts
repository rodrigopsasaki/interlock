import { readFileSync } from "node:fs";

function isDivider(cell: string): boolean {
  return /^-+$/.test(cell);
}

function rowCells(line: string): readonly string[] | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return undefined;
  return trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

export function vocabularyPurposes(
  agentsMdPath: string,
): ReadonlyMap<string, string> {
  const lines = readFileSync(agentsMdPath, "utf-8").split("\n");
  const sectionStart = lines.findIndex(
    (line) => line.trim() === "## Vocabulary",
  );
  const map = new Map<string, string>();
  if (sectionStart === -1) return map;

  for (const line of lines.slice(sectionStart + 1)) {
    if (line.startsWith("## ")) break;
    const cells = rowCells(line);
    if (cells === undefined || cells.length !== 2) continue;
    const [term, meaning] = cells;
    if (term === undefined || meaning === undefined) continue;
    if (term === "term" || isDivider(term)) continue;
    map.set(term, meaning);
  }
  return map;
}

export function firstSentence(text: string): string {
  const match = /^(.*?[.!?])(\s|$)/.exec(text);
  return match?.[1] ?? text;
}

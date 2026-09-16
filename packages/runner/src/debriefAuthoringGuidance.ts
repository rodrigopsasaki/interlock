const START = "<!-- interlock: debrief-authoring-guidance@v1:start -->";
const END = "<!-- interlock: debrief-authoring-guidance@v1:end -->";

export const pathAppliesToExample =
  "applies_to: { kind: path, path: packages/substrate/src/evidence.ts }";
export const repositoryAppliesToExample = "applies_to: { kind: repository }";

export const debriefAuthoringGuidance = [
  START,
  "## Debrief authoring",
  "",
  "`found_at`, `rests_on`, and `hunks` say what supports a claim. Optional `applies_to` says",
  "where you judge a rooted lesson useful; it never supplies support or ratifies a claim.",
  "",
  "Prefer a justified narrow path:",
  "",
  "```yaml",
  pathAppliesToExample,
  "```",
  "",
  "Use repository scope only with an explicit cross-cutting reason:",
  "",
  "```yaml",
  repositoryAppliesToExample,
  "```",
  "",
  "Omit `applies_to` when no target is warranted. Keep the real decision and its why, and say what",
  "a future session can act on. It changes neither authority nor gates, and does not establish better",
  "judgment. Treat received context as a hypothesis: check, reject, or leave it unused.",
  END,
].join("\n");

interface Fence {
  readonly character: "`" | "~";
  readonly length: number;
}

function fenceAt(line: string): Fence | undefined {
  const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);
  const delimiter = match?.[1];
  if (delimiter === undefined) return undefined;
  const character = delimiter[0];
  if (character !== "`" && character !== "~") return undefined;
  return { character, length: delimiter.length };
}

function closesFence(line: string, fence: Fence): boolean {
  const candidate = fenceAt(line);
  if (
    candidate === undefined ||
    candidate.character !== fence.character ||
    candidate.length < fence.length
  ) {
    return false;
  }
  return /^[ \t]*$/.test(line.trimStart().slice(candidate.length));
}

function generatedGuidanceEnd(lines: readonly string[], start: number): number | undefined {
  let fence: Fence | undefined;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (fence !== undefined) {
      if (closesFence(line, fence)) fence = undefined;
      continue;
    }
    const opened = fenceAt(line);
    if (opened !== undefined) {
      fence = opened;
      continue;
    }
    if (line === END) return index;
  }
  return undefined;
}

function replaceGeneratedGuidance(body: string): string | undefined {
  const lines = body.split("\n");
  const output: string[] = [];
  let replaced = false;
  let fence: Fence | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (fence !== undefined) {
      output.push(line);
      if (closesFence(line, fence)) fence = undefined;
      continue;
    }

    const opened = fenceAt(line);
    if (opened !== undefined) {
      output.push(line);
      fence = opened;
      continue;
    }
    if (line !== START) {
      output.push(line);
      continue;
    }

    const end = generatedGuidanceEnd(lines, index);
    if (end === undefined) {
      output.push(line);
      continue;
    }
    if (!replaced) {
      output.push(debriefAuthoringGuidance);
      replaced = true;
    }
    index = end;
  }

  return replaced ? output.join("\n") : undefined;
}

export function withDebriefAuthoringGuidance(body: string): string {
  const replaced = replaceGeneratedGuidance(body);
  if (replaced !== undefined) return replaced;
  const separator = body === "" || body.endsWith("\n\n") ? "" : "\n";
  return `${body}${separator}${debriefAuthoringGuidance}\n`;
}

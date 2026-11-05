import type { Narrated, Note } from "ledger";

export interface AttemptSaid {
  readonly kind: Note["kind"];
  readonly text: string;
  readonly at: string;
}

export interface RunnerStep {
  readonly at: number;
  readonly line: string;
}

function wordsOf(entry: Note): string {
  switch (entry.kind) {
    case "choice":
      return entry.chose;
    case "surprise":
      return entry.observed;
    case "question":
      return entry.asked;
  }
}

export function saidOf(notes: readonly Note[]): AttemptSaid | undefined {
  const latest = notes.at(-1);
  return latest === undefined
    ? undefined
    : { kind: latest.kind, text: wordsOf(latest), at: latest.at };
}

export function runnerOf(narration: readonly Narrated[]): readonly RunnerStep[] {
  return narration.map((step) => ({ at: step.at, line: step.line }));
}

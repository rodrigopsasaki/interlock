import type { Mark } from "ledger";

interface Counts {
  readonly rooted: number;
  readonly unrooted: number;
  readonly unexplained: number;
  readonly gap: number;
}

function countByKind(marks: readonly Mark[]): Counts {
  const counts = { rooted: 0, unrooted: 0, unexplained: 0, gap: 0 };
  for (const mark of marks) counts[mark.kind] += 1;
  return counts;
}

function describe(mark: Mark): string | undefined {
  switch (mark.kind) {
    case "unrooted":
      return `unrooted: ${mark.because}`;
    case "unexplained":
      return `unexplained: "${mark.hunk}" -- expected a decision citing it`;
    case "rooted":
    case "gap":
      return undefined;
  }
}

export function renderVerification(result: { readonly marks: readonly Mark[] }): string {
  const counts = countByKind(result.marks);
  const lines = [
    `rooted ${counts.rooted}, unrooted ${counts.unrooted}, unexplained ${counts.unexplained}, gap ${counts.gap}`,
  ];
  for (const mark of result.marks) {
    const line = describe(mark);
    if (line !== undefined) lines.push(line);
  }
  return lines.join("\n");
}

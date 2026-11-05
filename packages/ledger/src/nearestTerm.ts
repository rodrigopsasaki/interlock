export interface NearestTerm {
  readonly term: string;
  readonly distance: number;
}

function at(row: readonly number[], index: number): number {
  const value = row[index];
  if (value === undefined) throw new Error(`levenshtein: index ${index} out of bounds`);
  return value;
}

function levenshtein(a: string, b: string): number {
  const width = b.length + 1;
  let previousRow = Array.from({ length: width }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const currentRow: number[] = [i];
    for (let j = 1; j < width; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currentRow.push(
        Math.min(at(previousRow, j) + 1, at(currentRow, j - 1) + 1, at(previousRow, j - 1) + cost),
      );
    }
    previousRow = currentRow;
  }
  return at(previousRow, b.length);
}

export function nearestTerm(word: string, known: Iterable<string>): NearestTerm {
  let best: NearestTerm | undefined;
  for (const candidate of [...known].sort()) {
    const distance = levenshtein(word.toLowerCase(), candidate);
    if (best === undefined || distance < best.distance) {
      best = { term: candidate, distance };
    }
  }
  return best ?? { term: "", distance: word.length };
}

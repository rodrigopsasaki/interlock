import type { Discovery } from "ledger";

export interface SliceCount {
  readonly known: number;
  readonly unknown: number;
}

const PATH_REFERENCE = /[\w-]+(?:\/[\w-]+)*\.[a-zA-Z]{2,12}\b/g;

function pathReferencesIn(text: string): readonly string[] {
  return [...text.matchAll(PATH_REFERENCE)].map((match) => match[0]);
}

export function countDiscoveriesAgainstSlice(
  sliceBody: string,
  discoveries: readonly Discovery[],
): SliceCount {
  let known = 0;
  let unknown = 0;
  for (const discovery of discoveries) {
    const named = pathReferencesIn(discovery.foundAt).some((path) => sliceBody.includes(path));
    if (named) known += 1;
    else unknown += 1;
  }
  return { known, unknown };
}

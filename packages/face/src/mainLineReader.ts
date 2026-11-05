import { isErr } from "@phyxiusjs/fp";
import {
  type ClearedHead,
  type Judged,
  judgeLanded,
  type Landed,
  type LandedReader,
  NO_MAIN_BRANCH,
  unknownLanded,
} from "./landed.ts";
import {
  type CachedLanded,
  type LandedKey,
  landedKeyOf,
  landedKeyText,
  readLandedCache,
  writeLandedCache,
} from "./landedCache.ts";
import { boundedGit, type GitRunner, type MainSnapshot, mainSnapshotOf } from "./mainLine.ts";

export interface MainLineReader {
  readonly read: (heads: readonly ClearedHead[]) => Promise<LandedReader>;
}

export interface MainLineOptions {
  readonly git?: GitRunner;
}

type KnownHead = Extract<ClearedHead, { kind: "known" }>;

function isKnown(cleared: ClearedHead): cleared is KnownHead {
  return cleared.kind === "known";
}

function readerOf(judge: (cleared: KnownHead) => Landed): LandedReader {
  return (cleared) => (isKnown(cleared) ? judge(cleared) : unknownLanded(cleared.because));
}

export function mainLineReader(repoRoot: string, options: MainLineOptions = {}): MainLineReader {
  const git = { repoRoot, run: options.git ?? boundedGit() };
  const remembered = new Map<string, CachedLanded>();
  let rememberedOn: MainSnapshot | undefined;

  async function judged(
    main: MainSnapshot,
    keys: ReadonlyMap<string, LandedKey>,
  ): Promise<ReadonlyMap<string, Landed>> {
    const read = new Map<string, Landed>();
    const missing = [...keys].filter(([text]) => !remembered.has(text));
    if (missing.length > 0) {
      for (const entry of await readLandedCache(repoRoot, main)) {
        const text = landedKeyText(entry.key);
        if (keys.has(text)) remembered.set(text, entry);
      }
    }
    const fresh = await Promise.all(
      missing
        .filter(([text]) => !remembered.has(text))
        .map(
          async ([text, key]): Promise<[string, LandedKey, Judged]> => [
            text,
            key,
            await judgeLanded(
              git,
              main,
              key.head,
              key.base.kind === "recorded" ? key.base.sha : undefined,
            ),
          ],
        ),
    );
    let settledAny = false;
    for (const [text, key, judgment] of fresh) {
      read.set(text, judgment.landed);
      if (judgment.kind === "settled") {
        remembered.set(text, { key, landed: judgment.landed });
        settledAny = true;
      }
    }
    if (settledAny) {
      const merged = new Map(
        (await readLandedCache(repoRoot, main)).map((entry) => [landedKeyText(entry.key), entry]),
      );
      for (const [text, entry] of remembered) merged.set(text, entry);
      await writeLandedCache(repoRoot, [...merged.values()]);
    }
    for (const [text] of keys) {
      const entry = remembered.get(text);
      if (entry !== undefined) read.set(text, entry.landed);
    }
    return read;
  }

  return {
    async read(heads) {
      const snapshot = await mainSnapshotOf(git);
      if (isErr(snapshot)) return readerOf(() => unknownLanded(snapshot.error));
      const main = snapshot.value;
      if (main === undefined) return readerOf(() => unknownLanded(NO_MAIN_BRANCH));
      if (rememberedOn?.branch !== main.branch || rememberedOn.sha !== main.sha) {
        remembered.clear();
        rememberedOn = main;
      }
      const textOf = (cleared: KnownHead): string =>
        landedKeyText(landedKeyOf(main, cleared.head, cleared.base));
      const keys = new Map(
        heads
          .filter(isKnown)
          .map((cleared) => [textOf(cleared), landedKeyOf(main, cleared.head, cleared.base)]),
      );
      const landed = await judged(main, keys);
      return readerOf(
        (cleared) =>
          landed.get(textOf(cleared)) ??
          unknownLanded(`this read did not judge the cleared head ${cleared.head}`),
      );
    },
  };
}

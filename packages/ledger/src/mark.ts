import { type Derivation, isDerivation } from "./derivation.ts";
import { isRecord, isString, prop } from "./validate.ts";

export interface Gap {
  readonly term: string;
  readonly nearest: string;
  readonly difference: string;
}

export function isGap(value: unknown): value is Gap {
  return (
    isRecord(value) &&
    isString(prop(value, "term")) &&
    isString(prop(value, "nearest")) &&
    isString(prop(value, "difference"))
  );
}

export type Mark =
  | {
      readonly kind: "rooted";
      readonly derivation: Derivation;
      readonly hunk: string;
    }
  | {
      readonly kind: "unrooted";
      readonly derivation: Derivation;
      readonly because: string;
    }
  | {
      readonly kind: "unexplained";
      readonly derivation: Derivation;
      readonly hunk: string;
    }
  | {
      readonly kind: "gap";
      readonly derivation: Derivation;
      readonly gap: Gap;
    };

export const MARK_KINDS = ["rooted", "unrooted", "unexplained", "gap"] as const;

export type MarkKind = (typeof MARK_KINDS)[number];

export type MarkCounts = Readonly<Record<MarkKind, number>>;

export function isMarkKind(value: unknown): value is MarkKind {
  return MARK_KINDS.some((kind) => kind === value);
}

export function countMarks(marks: readonly Mark[]): MarkCounts {
  const countOf = (kind: MarkKind): number => marks.filter((each) => each.kind === kind).length;
  return {
    rooted: countOf("rooted"),
    unrooted: countOf("unrooted"),
    unexplained: countOf("unexplained"),
    gap: countOf("gap"),
  };
}

export function isMarkCounts(value: unknown): value is MarkCounts {
  return (
    isRecord(value) &&
    MARK_KINDS.every((kind) => {
      const count = prop(value, kind);
      return typeof count === "number" && Number.isInteger(count) && count >= 0;
    })
  );
}

export const mark = {
  rooted: (derivation: Derivation, hunk: string): Mark => ({
    kind: "rooted",
    derivation,
    hunk,
  }),
  unrooted: (derivation: Derivation, because: string): Mark => ({
    kind: "unrooted",
    derivation,
    because,
  }),
  unexplained: (derivation: Derivation, hunk: string): Mark => ({
    kind: "unexplained",
    derivation,
    hunk,
  }),
  gap: (derivation: Derivation, gap: Gap): Mark => ({
    kind: "gap",
    derivation,
    gap,
  }),
};

export function isMark(value: unknown): value is Mark {
  if (!isRecord(value)) return false;
  const kind = prop(value, "kind");
  const derivation = prop(value, "derivation");
  if (typeof kind !== "string" || !isDerivation(derivation)) return false;
  switch (kind) {
    case "rooted":
    case "unexplained":
      return isString(prop(value, "hunk"));
    case "unrooted":
      return isString(prop(value, "because"));
    case "gap":
      return isGap(prop(value, "gap"));
    default:
      return false;
  }
}

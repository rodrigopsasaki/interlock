import type { PlansEntry } from "./plansEntry.ts";
import type { Position } from "./position.ts";
import type { Verb } from "./verb.ts";

export type Level = "plans" | "graph" | "node" | "session";

export interface Selection {
  readonly graph?: string;
  readonly node?: string;
  readonly session?: string;
}

export type PromptField = "because" | "by";

export interface PromptState {
  readonly verb: Verb;
  readonly field: PromptField;
  readonly because: string;
  readonly by: string;
}

export type FaceState =
  | {
      readonly kind: "browsing";
      readonly level: Level;
      readonly index: number;
      readonly selection: Selection;
      readonly help: boolean;
      readonly status?: string;
    }
  | {
      readonly kind: "prompting";
      readonly level: Level;
      readonly index: number;
      readonly selection: Selection;
      readonly prompt: PromptState;
    };

export function initialFaceState(): FaceState {
  return {
    kind: "browsing",
    level: "plans",
    index: 0,
    selection: {},
    help: false,
  };
}

export interface FaceWorld {
  readonly plans: readonly PlansEntry[];
  readonly position?: Position;
  readonly by?: string;
}

export type FaceEffect =
  | {
      readonly kind: "dispatch";
      readonly verb: Verb;
      readonly by: string;
      readonly because: string;
    }
  | {
      readonly kind: "focus";
      readonly graph: string;
      readonly node: string;
      readonly session: string;
    }
  | { readonly kind: "redraw" }
  | { readonly kind: "quit" };

export interface Reduced {
  readonly state: FaceState;
  readonly effect?: FaceEffect;
}

export type FaceKey =
  | { readonly name: "up" }
  | { readonly name: "down" }
  | { readonly name: "enter" }
  | { readonly name: "escape" }
  | { readonly name: "backspace" }
  | { readonly name: "char"; readonly char: string };

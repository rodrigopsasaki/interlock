import {
  type FaceKey,
  type FaceState,
  type FaceWorld,
  type Level,
  type PromptField,
  type Reduced,
  type Selection,
} from "./faceState.ts";
import { isLiveAttempt, nodeRowsOf } from "./nodeRow.ts";
import type { PositionNode } from "./position.ts";
import { verbNeedsAccountability, type Verb } from "./verb.ts";

function currentNode(
  world: FaceWorld,
  selection: Selection,
): PositionNode | undefined {
  return world.position?.nodes.find((node) => node.id === selection.node);
}

function rowCountAt(
  level: Level,
  world: FaceWorld,
  selection: Selection,
): number {
  switch (level) {
    case "plans":
      return world.plans.length;
    case "graph":
      return world.position?.nodes.length ?? 0;
    case "node":
      return nodeRowsOf(currentNode(world, selection) ?? emptyNode()).length;
    case "session":
      return 0;
  }
}

function emptyNode(): PositionNode {
  return {
    id: "",
    dependsOn: [],
    state: { kind: "ready" },
    gates: [],
    attempts: [],
    float: { kind: "unknown", because: "" },
  };
}

function clampedMove(index: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, index + delta));
}

function browsing(
  level: Level,
  index: number,
  selection: Selection,
  help = false,
  status?: string,
): FaceState {
  return {
    kind: "browsing",
    level,
    index,
    selection,
    help,
    ...(status === undefined ? {} : { status }),
  };
}

function parentLevel(level: Level): Level {
  switch (level) {
    case "plans":
      return "plans";
    case "graph":
      return "plans";
    case "node":
      return "graph";
    case "session":
      return "node";
  }
}

function goUp(state: Extract<FaceState, { kind: "browsing" }>): Reduced {
  if (state.help)
    return {
      state: browsing(state.level, state.index, state.selection, false),
    };
  if (state.level === "plans") return { state };
  return { state: browsing(parentLevel(state.level), 0, state.selection) };
}

function beginPrompt(
  state: Extract<FaceState, { kind: "browsing" }>,
  verb: Verb,
  world: FaceWorld,
): Reduced {
  if (!verbNeedsAccountability(verb.kind)) {
    return {
      state,
      effect: { kind: "dispatch", verb, by: world.by ?? "", because: "" },
    };
  }
  return {
    state: {
      kind: "prompting",
      level: state.level,
      index: state.index,
      selection: state.selection,
      prompt: { verb, field: "because", because: "", by: world.by ?? "" },
    },
  };
}

function verbAt(
  state: Extract<FaceState, { kind: "browsing" }>,
  char: string,
  world: FaceWorld,
): Verb | undefined {
  const plan = world.plans[state.index];
  const node = world.position?.nodes[state.index];
  const graph = world.position?.graph ?? plan?.graph;

  if (state.level === "plans") {
    if (char === "a" && plan !== undefined)
      return { kind: "approve", graph: plan.graph };
    if (char === "s") return { kind: "sweep" };
    return undefined;
  }
  if (state.level === "graph") {
    if (graph === undefined) return undefined;
    if (char === "b") return { kind: "backfill", graph };
    if (node === undefined) return undefined;
    if (char === "R") return { kind: "run", graph, node: node.id };
    if (char === "J") return { kind: "judge", graph, node: node.id };
    if (char === "c") return { kind: "cancel", graph, node: node.id };
    if (char === "x") return { kind: "reset", graph, node: node.id };
    return undefined;
  }
  if (state.level === "node") {
    if (
      char !== "w" ||
      graph === undefined ||
      state.selection.node === undefined
    )
      return undefined;
    const rows = nodeRowsOf(currentNode(world, state.selection) ?? emptyNode());
    const row = rows[state.index];
    if (row?.kind !== "gate") return undefined;
    return {
      kind: "waive",
      graph,
      node: state.selection.node,
      gate: row.gate.id,
    };
  }
  return undefined;
}

function reduceEnter(
  state: Extract<FaceState, { kind: "browsing" }>,
  world: FaceWorld,
): Reduced {
  if (state.help) return { state };
  switch (state.level) {
    case "plans": {
      const plan = world.plans[state.index];
      if (plan === undefined) return { state };
      return { state: browsing("graph", 0, { graph: plan.graph }) };
    }
    case "graph": {
      const node = world.position?.nodes[state.index];
      if (node === undefined) return { state };
      return {
        state: browsing("node", 0, { ...state.selection, node: node.id }),
      };
    }
    case "node": {
      const node = currentNode(world, state.selection);
      if (node === undefined) return { state };
      const rows = nodeRowsOf(node);
      const row = rows[state.index];
      if (row?.kind !== "attempt") return { state };
      const graph = state.selection.graph ?? world.position?.graph;
      if (graph === undefined) return { state };
      if (isLiveAttempt(row.attempt)) {
        return {
          state,
          effect: {
            kind: "focus",
            graph,
            node: node.id,
            session: row.attempt.session,
          },
        };
      }
      return {
        state: browsing("session", 0, {
          ...state.selection,
          session: row.attempt.session,
        }),
      };
    }
    case "session":
      return { state };
  }
}

function reduceBrowsingChar(
  state: Extract<FaceState, { kind: "browsing" }>,
  char: string,
  world: FaceWorld,
): Reduced {
  if (char === "j") {
    return {
      state: {
        ...state,
        index: clampedMove(
          state.index,
          1,
          rowCountAt(state.level, world, state.selection),
        ),
      },
    };
  }
  if (char === "k") {
    return {
      state: {
        ...state,
        index: clampedMove(
          state.index,
          -1,
          rowCountAt(state.level, world, state.selection),
        ),
      },
    };
  }
  if (char === "q") return { state, effect: { kind: "quit" } };
  if (char === "r") return { state, effect: { kind: "redraw" } };
  if (char === "?") {
    return { state: { ...state, help: !state.help } };
  }
  if (state.help) return { state };
  const verb = verbAt(state, char, world);
  return verb === undefined ? { state } : beginPrompt(state, verb, world);
}

function reduceBrowsing(
  state: Extract<FaceState, { kind: "browsing" }>,
  key: FaceKey,
  world: FaceWorld,
): Reduced {
  switch (key.name) {
    case "up":
      return {
        state: {
          ...state,
          index: clampedMove(
            state.index,
            -1,
            rowCountAt(state.level, world, state.selection),
          ),
        },
      };
    case "down":
      return {
        state: {
          ...state,
          index: clampedMove(
            state.index,
            1,
            rowCountAt(state.level, world, state.selection),
          ),
        },
      };
    case "enter":
      return reduceEnter(state, world);
    case "escape":
    case "backspace":
      return goUp(state);
    case "char":
      return reduceBrowsingChar(state, key.char, world);
  }
}

function withField(
  prompt: Extract<FaceState, { kind: "prompting" }>["prompt"],
  field: PromptField,
  value: string,
): Extract<FaceState, { kind: "prompting" }>["prompt"] {
  return field === "because"
    ? { ...prompt, because: value }
    : { ...prompt, by: value };
}

function fieldValue(
  prompt: Extract<FaceState, { kind: "prompting" }>["prompt"],
): string {
  return prompt.field === "because" ? prompt.because : prompt.by;
}

function reducePrompting(
  state: Extract<FaceState, { kind: "prompting" }>,
  key: FaceKey,
): Reduced {
  if (key.name === "escape") {
    return {
      state: browsing(
        state.level,
        state.index,
        state.selection,
        false,
        "cancelled",
      ),
    };
  }
  if (key.name === "backspace") {
    const value = fieldValue(state.prompt).slice(0, -1);
    return {
      state: {
        ...state,
        prompt: withField(state.prompt, state.prompt.field, value),
      },
    };
  }
  if (key.name === "enter") {
    if (fieldValue(state.prompt).length === 0) {
      return { state };
    }
    if (state.prompt.field === "because" && state.prompt.by.length === 0) {
      return { state: { ...state, prompt: { ...state.prompt, field: "by" } } };
    }
    return {
      state: browsing(state.level, state.index, state.selection),
      effect: {
        kind: "dispatch",
        verb: state.prompt.verb,
        by: state.prompt.by,
        because: state.prompt.because,
      },
    };
  }
  if (key.name === "char") {
    const value = fieldValue(state.prompt) + key.char;
    return {
      state: {
        ...state,
        prompt: withField(state.prompt, state.prompt.field, value),
      },
    };
  }
  return { state };
}

export function reduce(
  state: FaceState,
  key: FaceKey,
  world: FaceWorld,
): Reduced {
  return state.kind === "browsing"
    ? reduceBrowsing(state, key, world)
    : reducePrompting(state, key);
}

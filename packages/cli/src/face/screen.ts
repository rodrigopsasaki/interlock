import {
  renderGraphFrame,
  renderHelpOverlay,
  renderNodeFrame,
  renderPlansFrame,
  type FaceState,
  type FaceWorld,
} from "face";

function renderBody(
  state: FaceState,
  world: FaceWorld,
  sessionText: string | undefined,
): string {
  switch (state.level) {
    case "plans":
      return renderPlansFrame(world.plans, state.index);
    case "graph":
      return world.position === undefined
        ? "(loading graph…)"
        : renderGraphFrame(world.position, state.index);
    case "node": {
      const node = world.position?.nodes.find(
        (candidate) => candidate.id === state.selection.node,
      );
      return node === undefined
        ? "(loading node…)"
        : renderNodeFrame(node, state.index);
    }
    case "session":
      return sessionText ?? "(loading session…)";
  }
}

function renderBottomLine(state: FaceState): string {
  if (state.kind === "prompting") {
    const label = state.prompt.field === "because" ? "because" : "by";
    const value =
      state.prompt.field === "because" ? state.prompt.because : state.prompt.by;
    return `${state.prompt.verb.kind} — ${label}: ${value}▌`;
  }
  return state.status ?? "? for keys";
}

export function renderScreen(
  state: FaceState,
  world: FaceWorld,
  sessionText: string | undefined,
): string {
  const body = renderBody(state, world, sessionText);
  const withHelp =
    state.kind === "browsing" && state.help
      ? `${body}\n\n${renderHelpOverlay()}`
      : body;
  return `${withHelp}\n\n${renderBottomLine(state)}`;
}

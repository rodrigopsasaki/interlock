export type {
  Agent,
  AgentIdentity,
  AgentStatus,
  Pane,
  Runtime,
  RuntimeRefusal,
} from "./runtime.ts";
export { explainRuntimeRefusal } from "./runtime.ts";

export { buildOpeningPrompt } from "./openingPrompt.ts";

export { createHerdrRuntime, defaultHerdrSocketPath } from "./herdr/adapter.ts";
export {
  createTmuxRuntime,
  defaultTmuxRunner,
  type TmuxCommandRunner,
} from "./tmux/adapter.ts";

export type { LocalConfig, LocalConfigRefusal } from "./localConfig.ts";
export {
  LOCAL_CONFIG_SHAPE,
  explainLocalConfigRefusal,
  loadLocalConfig,
  localConfigPath,
} from "./localConfig.ts";

export type { StartupAnswer } from "./startupAnswers.ts";
export { matchesScreen } from "./startupAnswers.ts";

export type { StandingGate, StandingGatesRefusal } from "./standingGates.ts";
export {
  configPath,
  explainStandingGatesRefusal,
  loadStandingGates,
} from "./standingGates.ts";

export { gitTrackedFiles } from "./scope.ts";
export { unmetDependencies } from "./dependencies.ts";
export type { GateCommand, PlaceholderRefusal } from "./gateCommand.ts";
export {
  declaredGateIds,
  gateCommandTable,
  substituteGateCommand,
} from "./gateCommand.ts";

export type { WorktreeRefusal } from "./worktree.ts";
export {
  createDetachedWorktree,
  ensureNodeWorktree,
  explainWorktreeRefusal,
  removeWorktree,
} from "./worktree.ts";

export type { WorktreeSetupRefusal } from "./worktreeSetup.ts";
export {
  explainWorktreeSetupRefusal,
  runSetupCommand,
} from "./worktreeSetup.ts";

export {
  lastNonEmptyLine,
  screenPath,
  writeScreenSnapshot,
} from "./sessionScreen.ts";

export type { LeaseHandle } from "./lease.ts";
export { takeLease } from "./lease.ts";

export type { BriefRefusal } from "./sessionBrief.ts";
export {
  briefExists,
  briefPath,
  buildBrief,
  explainBriefRefusal,
  writeBriefIntoWorktree,
} from "./sessionBrief.ts";

export type { GateJudgeRefusal, GateJudgeRequest } from "./gateJudge.ts";
export {
  GATE_DERIVATION_VERSION,
  explainGateJudgeRefusal,
  judgeGates,
} from "./gateJudge.ts";

export { ABANDONED_AUTHORITY, sweepExpiredLeases } from "./sweep.ts";

export type {
  BackfillNodeResult,
  BackfillOptions,
  BackfillRefusal,
} from "./backfill.ts";
export { backfillGraph, explainBackfillRefusal } from "./backfill.ts";

export type {
  BackfillNodeResult,
  BackfillOptions,
  BackfillRefusal,
} from "./backfill.ts";
export { backfillGraph, explainBackfillRefusal } from "./backfill.ts";
export {
  authoritativeBriefGates,
  diffGates,
  diffScope,
  renderBriefFile,
} from "./briefRewrite.ts";
export { claudeLiveWork, liveWorkOfTranscript } from "./claude/liveWork.ts";
export { withRenderedContextSlice } from "./contextSlice.ts";
export { decidedNodeRefusal } from "./decidedNode.ts";
export { unmetDependencies } from "./dependencies.ts";
export type {
  ExecAdmission,
  ExecPhaseKind,
  ExecPhaseOutcome,
  ExecPhaseRequest,
  ExecPhaseState,
  ExecRuntimeRefusal,
  ExecSessionAsk,
  ExecSessionRecord,
  ExecSessionView,
  ExecTranscriptLine,
} from "./execRuntime.ts";
export {
  DEFAULT_DRAIN_GRACE_MS,
  DEFAULT_TERM_GRACE_MS,
  execRunRoot,
  execSocketPathLength,
  execSocketSecretDigest,
  listExecSessions,
  readExecTranscript,
  readLatestRecord,
  removeExecRun,
  runExecPhase,
  SESSION_SHAPE,
  TRANSCRIPT_SHAPE,
} from "./execRuntime.ts";
export type { GateCommand, PlaceholderRefusal } from "./gateCommand.ts";
export {
  declaredGateIds,
  gateCommandTable,
  substituteGateCommand,
} from "./gateCommand.ts";
export type {
  GateCommandResult,
  GateCommandRunner,
  GateJudgeRefusal,
  GateJudgeRequest,
} from "./gateJudge.ts";
export {
  DEFAULT_GATE_HOLD_TIMEOUT_MS,
  explainGateJudgeRefusal,
  GATE_DERIVATION_VERSION,
  judgeGates,
} from "./gateJudge.ts";
export type {
  GateOutputRead,
  GateOutputReference,
  GateOutputRefusal,
} from "./gateOutput.ts";
export {
  explainGateOutputRefusal,
  GATE_OUTPUT_SHAPE,
  gateOutputReference,
  readGateOutput,
  retainGateOutput,
  storeGateOutput,
} from "./gateOutput.ts";
export type { HerdrTiming, LiveWorkSource } from "./herdr/adapter.ts";
export {
  createHerdrRuntime,
  DEFAULT_LIVE_WORK_SOURCES,
  defaultHerdrSocketPath,
} from "./herdr/adapter.ts";
export type { InterpreterCorrection } from "./interpreterBrief.ts";
export { extractAsk, interpreterBriefBody } from "./interpreterBrief.ts";
export type {
  JudgeWorktreeRefusal,
  JudgeWorktreeRequest,
} from "./judgeWorktree.ts";
export {
  explainJudgeWorktreeRefusal,
  HELD_REVISIT_MS,
  judgeWorktree,
} from "./judgeWorktree.ts";
export type { AppendsEvents, LeaseHandle } from "./lease.ts";
export { takeLease } from "./lease.ts";
export type { LocalConfig, LocalConfigRefusal } from "./localConfig.ts";
export {
  DEFAULT_STARTUP_TIMEOUT_MS,
  explainLocalConfigRefusal,
  LOCAL_CONFIG_SHAPE,
  loadLocalConfig,
  localConfigPath,
} from "./localConfig.ts";
export type { MachineHold } from "./machineOutbox.ts";
export {
  admitMachine,
  machineDelivery,
  machineIntent,
  reconcileMachineOnStart,
} from "./machineOutbox.ts";
export type { MachineAttempt, MachineProvider } from "./machineProvider.ts";
export {
  loadMachine,
  machinePath,
  NO_MACHINE_PROVIDER,
  parseMachine,
  providerArgv,
  resolveMachine,
  runProviderCommand,
  validateExecMachine,
} from "./machineProvider.ts";
export { recordingNarrate } from "./narration.ts";
export type { NodeEngineRefusal, NodeVersionRunner } from "./nodeEngine.ts";
export type { PriorWork, SessionRole } from "./openingPrompt.ts";
export { buildOpeningPrompt } from "./openingPrompt.ts";
export { renderOpeningView } from "./openingView.ts";
export type {
  PromptDeliveryOutcome,
  PromptDeliveryRequest,
} from "./promptDelivery.ts";
export { deliverOpeningPrompt } from "./promptDelivery.ts";
export type { RoutingOptions } from "./providerRouting.ts";
export { routeRuntime } from "./providerRouting.ts";
export type { RoleShape } from "./roleShape.ts";
export { roleShapeFor } from "./roleShape.ts";
export {
  type MarkerConflict,
  mergeRunnerMarker,
  RUNNER_MARKER_KEYS,
  type RunnerMarker,
  runnerMarker,
} from "./runnerMarker.ts";
export type {
  Agent,
  AgentIdentity,
  AgentIdentityQuery,
  AgentObservation,
  AgentStatus,
  LiveWork,
  Pane,
  PaneFact,
  PreparedLaunch,
  ProbeCheck,
  ProbeExecutor,
  ProbeInvocation,
  ProbeProcessIdentity,
  ProbeProcessLifecycle,
  Runtime,
  RuntimeObservation,
  RuntimeRefusal,
} from "./runtime.ts";
export {
  describeLiveWork,
  explainRuntimeRefusal,
  NO_OBSERVATION_CAPABILITY,
  observeRuntime,
  unobservedAttempt,
} from "./runtime.ts";
export type {
  CatalogueRuntime,
  MergedRuntimes,
  MergeRuntimesRefusal,
  ResolvedRuntime,
  RuntimeCatalogueRefusal,
} from "./runtimeCatalogue.ts";
export {
  DEFAULT_RUNTIME_NAME,
  EXEC_ENVIRONMENT_PASSTHROUGH_CAPABILITY,
  EXEC_HEADLESS_ARGS_PROBE_CAPABILITY,
  EXEC_MCP_EXCLUSIVE_CAPABILITY,
  EXEC_WRITABLE_ROOTS_SLOT_CAPABILITY,
  execRuntimeArgv,
  explainMergeRuntimesRefusal,
  explainRuntimeCatalogueRefusal,
  loadRuntimeCatalogue,
  mergeRuntimes,
  RUNTIME_CATALOGUE_SHAPE,
  RUNTIMES_V2_CAPABILITY,
  runtimeCataloguePath,
} from "./runtimeCatalogue.ts";
export type {
  ProbeExecutionOptions,
  ProbeProcessResult,
  ProbeProcessRunner,
} from "./runtimeProbe.ts";
export {
  execProbeInvocation,
  PROBE_CHECKS,
  PROBE_REAL_CHECKS_CAPABILITY,
  probePassed,
  runProbeChecks,
} from "./runtimeProbe.ts";
export type { RuntimeSelectionRefusal } from "./runtimeSelection.ts";
export {
  explainRuntimeSelectionRefusal,
  selectRuntime,
} from "./runtimeSelection.ts";
export { gitScope, gitTrackedFiles } from "./scope.ts";
export type {
  ScopeGuardChange,
  ScopeSnapshot,
  ScopeSnapshotEntry,
  ScopeSnapshotRefusal,
} from "./scopeGuard.ts";
export {
  changedScopePaths,
  describeScopeChange,
  snapshotScope,
} from "./scopeGuard.ts";
export type { BriefWriteOutcome, DeclaredNode, SessionBriefRefusal } from "./sessionBrief.ts";
export {
  briefExists,
  briefPath,
  buildBrief,
  explainSessionBriefRefusal,
  writeBriefIntoWorktree,
} from "./sessionBrief.ts";
export type {
  BeforeJudgeRefusal,
  DriveSessionOutcome,
  DriveSessionRequest,
} from "./sessionDrive.ts";
export {
  driveInteractiveSession,
  EXEC_PANE_INDEPENDENT_CAPABILITY,
  prepareLaunch,
} from "./sessionDrive.ts";
export type { SessionInheritance } from "./sessionRange.ts";
export { findInheritedSessionStart } from "./sessionRange.ts";
export {
  lastNonEmptyLine,
  screenPath,
  writeScreenSnapshot,
} from "./sessionScreen.ts";
export type { UnfinishedWork } from "./sessionWait.ts";
export { waitForSession } from "./sessionWait.ts";
export type { StandingGate, StandingGatesRefusal } from "./standingGates.ts";
export {
  configPath,
  explainStandingGatesRefusal,
  loadStandingGates,
} from "./standingGates.ts";
export type { StartupAnswer } from "./startupAnswers.ts";
export { matchesScreen } from "./startupAnswers.ts";
export { sweepExpiredLeases } from "./sweep.ts";
export {
  createTmuxRuntime,
  defaultTmuxRunner,
  type TmuxCommandRunner,
} from "./tmux/adapter.ts";
export { renderWalkSection, withWalkSection } from "./walkSection.ts";
export type { MainBranch, WorktreeOutcome, WorktreeRefusal } from "./worktree.ts";
export {
  baseHoldsGraph,
  commitBriefIfChanged,
  createDetachedWorktree,
  ensureNodeWorktree,
  explainWorktreeRefusal,
  isCommittedAtHead,
  mainBranchOf,
  mainChangesSince,
  removeWorktree,
  uncommittedPaths,
} from "./worktree.ts";
export type { WorktreeSetupExit, WorktreeSetupRefusal } from "./worktreeSetup.ts";
export {
  explainWorktreeSetupRefusal,
  runSetupCommand,
  runWorktreeSetup,
  SETUP_LOG_TAIL_BYTES,
} from "./worktreeSetup.ts";
export {
  expandProbeExec,
  PROBE_COMMAND_PLACEHOLDER,
  parseProbeExec,
} from "./writableRootArgs.ts";

import { isErr, ok, type Result } from "@phyxiusjs/fp";
import type { Outcome } from "ledger";
import {
  type AttemptCommit,
  attemptCommits,
  boundedGit,
  commitPatchIds,
  commitsPresent,
  type GitRunner,
  isAncestor,
  type MainCommit,
  type MainSnapshot,
  mainCommits,
  mainSnapshotOf,
  type RepoGit,
  type WholePatchIds,
  wholePatchIds,
} from "./mainLine.ts";

export type LandedBy = "ancestry" | "patch" | "squash";

export type Landed =
  | {
      readonly kind: "on-main";
      readonly main: string;
      readonly head: string;
      readonly by: LandedBy;
    }
  | { readonly kind: "not-on-main"; readonly main: string; readonly head: string }
  | {
      readonly kind: "reverted-on-main";
      readonly main: string;
      readonly head: string;
      readonly revertedBy: string;
    }
  | {
      readonly kind: "partly-reverted-on-main";
      readonly main: string;
      readonly head: string;
      readonly reverted: readonly string[];
      readonly revertedBy: Readonly<Record<string, string>>;
    }
  | { readonly kind: "unknown"; readonly because: string };

export type ClearedHead =
  | { readonly kind: "known"; readonly head: string; readonly base: string | undefined }
  | { readonly kind: "unknown"; readonly because: string };

export type LandedReader = (cleared: ClearedHead) => Landed;

export type Judged =
  | { readonly kind: "settled"; readonly landed: Landed }
  | { readonly kind: "transient"; readonly landed: Landed };

export function unknownLanded(because: string): Landed {
  return { kind: "unknown", because };
}

function settled(landed: Landed): Judged {
  return { kind: "settled", landed };
}

function transient(because: string): Judged {
  return { kind: "transient", landed: unknownLanded(because) };
}

function short(sha: string): string {
  return sha.slice(0, 12);
}

export function clearedHeadOf(
  cleared: Extract<Outcome, { kind: "cleared" }>,
  base: string | undefined,
): ClearedHead {
  const judged = new Set(
    cleared.receipts
      .filter((receipt) => receipt.derivation.kind === "gate")
      .map((receipt) => receipt.commitSha),
  );
  const [head, ...others] = [...judged];
  if (head === undefined) {
    return {
      kind: "unknown",
      because:
        "the cleared outcome carries no runner receipt, so no commit is known to have cleared",
    };
  }
  if (others.length > 0) {
    return {
      kind: "unknown",
      because: `the runner's receipts name ${judged.size} commits (${[...judged].map(short).join(", ")}), so the cleared head is ambiguous`,
    };
  }
  return { kind: "known", head, base };
}

export const NO_MAIN_BRANCH =
  "no main branch: origin's HEAD names no local branch, and neither main nor master exists";

interface Unit {
  readonly reported: string | undefined;
  readonly originals: readonly string[];
  readonly counterpart: string;
  readonly named: readonly string[];
  readonly paths: ReadonlySet<string>;
  readonly forward: string | undefined;
  readonly inverse: string | undefined;
}

interface Landing {
  readonly kind: "landing";
  readonly by: LandedBy;
  readonly units: readonly Unit[];
}

interface Evidence {
  readonly main: MainSnapshot;
  readonly head: string;
  readonly base: string;
  readonly commits: readonly AttemptCommit[];
  readonly scope: readonly string[];
  readonly mainLog: readonly MainCommit[];
  readonly mainIds: ReadonlyMap<string, string>;
  readonly forwardIds: ReadonlyMap<string, string>;
  readonly inverseIds: ReadonlyMap<string, string>;
  readonly whole: WholePatchIds;
}

const REVERT_TRAILER = /This reverts commit ([0-9a-f]{7,64})/g;

function revertedTargets(message: string): readonly string[] {
  return [...message.matchAll(REVERT_TRAILER)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
}

function revertNames(commit: MainCommit, named: readonly string[]): boolean {
  return revertedTargets(commit.message).some((target) =>
    named.some((sha) => sha.startsWith(target)),
  );
}

function commitUnit(evidence: Evidence, commit: AttemptCommit, counterpart: string): Unit {
  return {
    reported: commit.commit,
    originals: [commit.commit],
    counterpart,
    named: counterpart === commit.commit ? [commit.commit] : [counterpart, commit.commit],
    paths: new Set(commit.paths),
    forward: evidence.forwardIds.get(commit.commit),
    inverse: evidence.inverseIds.get(commit.commit),
  };
}

function landingOf(evidence: Evidence, reachable: boolean): Landing | Landed {
  const { main, head, commits, mainLog, mainIds, forwardIds, whole } = evidence;
  if (reachable) {
    return {
      kind: "landing",
      by: "ancestry",
      units: commits.map((commit) => commitUnit(evidence, commit, commit.commit)),
    };
  }

  const matching = (patchId: string | undefined): readonly string[] =>
    patchId === undefined
      ? []
      : mainLog.filter((entry) => mainIds.get(entry.commit) === patchId).map((m) => m.commit);
  const counterparts = commits.map((commit) => matching(forwardIds.get(commit.commit))[0]);
  const present = counterparts.filter((counterpart) => counterpart !== undefined).length;
  if (present === commits.length) {
    return {
      kind: "landing",
      by: "patch",
      units: commits.flatMap((commit, index) => {
        const counterpart = counterparts[index];
        return counterpart === undefined ? [] : [commitUnit(evidence, commit, counterpart)];
      }),
    };
  }

  const [squash] = matching(whole.forward);
  if (squash !== undefined) {
    return {
      kind: "landing",
      by: "squash",
      units: [
        {
          reported: undefined,
          originals: commits.map((commit) => commit.commit),
          counterpart: squash,
          named: [squash],
          paths: new Set(evidence.scope),
          forward: whole.forward,
          inverse: whole.inverse,
        },
      ],
    };
  }

  if (present > 0) {
    return unknownLanded(
      `${present} of the attempt's ${commits.length} commits are on ${main.branch} and the rest are not, and its whole change matches no single commit there`,
    );
  }
  return possibleLandingOf(evidence) ?? { kind: "not-on-main", main: main.branch, head };
}

function possibleLandingOf(evidence: Evidence): Landed | undefined {
  const attempted = new Set(evidence.scope);
  const ranked = evidence.mainLog
    .map((entry) => ({
      entry,
      shared: new Set(entry.paths.filter((path) => attempted.has(path))).size,
    }))
    .filter((candidate) => candidate.shared > 0)
    .sort(
      (a, b) =>
        b.shared - a.shared ||
        a.entry.committedAt - b.entry.committedAt ||
        (a.entry.commit < b.entry.commit ? -1 : a.entry.commit > b.entry.commit ? 1 : 0),
    );
  const [closest] = ranked;
  if (closest === undefined) return undefined;
  return unknownLanded(
    `no commit on ${evidence.main.branch} matches the attempt's commits or its whole change, but ${ranked.length} commits there since its base touch paths it changed; the closest, ${closest.entry.commit}, shares ${closest.shared} of its ${attempted.size} paths`,
  );
}

async function firstDescendant(
  git: RepoGit,
  ancestors: readonly string[],
  candidates: readonly MainCommit[],
): Promise<Result<MainCommit | undefined, string>> {
  const checked = await Promise.all(
    candidates.map(async (candidate) => {
      for (const ancestor of ancestors) {
        const descends = await isAncestor(git, ancestor, candidate.commit);
        if (isErr(descends)) return descends;
        if (!descends.value) return ok(false);
      }
      return ok(true);
    }),
  );
  for (const [index, descends] of checked.entries()) {
    if (isErr(descends)) return descends;
    if (descends.value) return ok(candidates[index]);
  }
  return ok(undefined);
}

function reapplies(patchId: string | undefined, forwards: ReadonlySet<string>): boolean {
  return patchId !== undefined && forwards.has(patchId);
}

function touches(entry: MainCommit, paths: ReadonlySet<string>): string | undefined {
  return entry.paths.find((path) => paths.has(path));
}

async function undoOf(
  git: RepoGit,
  evidence: Evidence,
  landing: Landing,
): Promise<Result<Landed, string>> {
  const { main, head, mainLog, mainIds, whole } = evidence;
  const undoers = new Map<Unit, MainCommit>();
  for (const unit of landing.units) {
    const candidates = mainLog.filter(
      (entry) =>
        entry.commit !== unit.counterpart &&
        (revertNames(entry, unit.named) ||
          (unit.inverse !== undefined && mainIds.get(entry.commit) === unit.inverse)),
    );
    const undoer = await firstDescendant(git, [unit.counterpart], candidates);
    if (isErr(undoer)) return undoer;
    if (undoer.value !== undefined) undoers.set(unit, undoer.value);
  }
  const standing = landing.units.filter((unit) => !undoers.has(unit));
  if (landing.units.length > 1 && standing.length > 0 && whole.inverse !== undefined) {
    const wholeUndoer = await firstDescendant(
      git,
      landing.units.map((unit) => unit.counterpart),
      mainLog.filter((entry) => mainIds.get(entry.commit) === whole.inverse),
    );
    if (isErr(wholeUndoer)) return wholeUndoer;
    const found = wholeUndoer.value;
    if (found !== undefined) for (const unit of standing) undoers.set(unit, found);
  }
  if (undoers.size === 0) return ok({ kind: "on-main", main: main.branch, head, by: landing.by });

  for (const [unit, undoer] of undoers) {
    const forwards = new Set(
      [unit.forward, undoers.size === landing.units.length ? whole.forward : undefined].filter(
        (patchId) => patchId !== undefined,
      ),
    );
    const again = await firstDescendant(
      git,
      [undoer.commit],
      mainLog.filter(
        (entry) =>
          entry.commit !== undoer.commit &&
          entry.commit !== unit.counterpart &&
          (revertNames(entry, [undoer.commit]) || reapplies(mainIds.get(entry.commit), forwards)),
      ),
    );
    if (isErr(again)) return again;
    if (again.value !== undefined) {
      const how = revertNames(again.value, [undoer.commit])
        ? "reverts that revert"
        : "applies it again";
      return ok(
        unknownLanded(
          `it reached ${main.branch} and ${short(undoer.commit)} undid it, but ${short(again.value.commit)} ${how}`,
        ),
      );
    }
  }

  const accounted = new Set(landing.units.flatMap((unit) => [unit.counterpart, ...unit.originals]));
  for (const unit of landing.units) {
    const own = undoers.get(unit)?.commit;
    const later = await firstDescendant(
      git,
      [unit.counterpart],
      mainLog.filter(
        (entry) =>
          !accounted.has(entry.commit) &&
          entry.commit !== own &&
          touches(entry, unit.paths) !== undefined,
      ),
    );
    if (isErr(later)) return later;
    if (later.value !== undefined) {
      return ok(
        unknownLanded(
          `${undoers.size} of the attempt's ${landing.units.length} landed units are undone on ${main.branch}, but ${short(later.value.commit)} there also changes ${touches(later.value, unit.paths)}, which ${short(unit.reported ?? unit.counterpart)} changed, so what still stands is unresolved`,
        ),
      );
    }
  }

  const order = new Map(mainLog.map((entry, index) => [entry.commit, index]));
  if (undoers.size === landing.units.length) {
    const [last] = [...undoers.values()].sort(
      (a, b) => (order.get(b.commit) ?? 0) - (order.get(a.commit) ?? 0),
    );
    if (last !== undefined) {
      return ok({ kind: "reverted-on-main", main: main.branch, head, revertedBy: last.commit });
    }
  }
  const reverted = landing.units.flatMap((unit) => {
    const undoer = undoers.get(unit);
    return unit.reported === undefined || undoer === undefined
      ? []
      : [{ original: unit.reported, undoer: undoer.commit }];
  });
  return ok({
    kind: "partly-reverted-on-main",
    main: main.branch,
    head,
    reverted: reverted.map((pair) => pair.original),
    revertedBy: Object.fromEntries(
      reverted.map((pair): [string, string] => [pair.original, pair.undoer]),
    ),
  });
}

async function judgeAttempt(
  git: RepoGit,
  main: MainSnapshot,
  head: string,
  base: string,
): Promise<Result<Landed, string>> {
  const commits = await attemptCommits(git, base, head);
  if (isErr(commits)) return commits;
  const scope = [...new Set(commits.value.flatMap((commit) => commit.paths))];
  const [reachable, mainLog, mainIds, forwardIds, inverseIds, whole] = await Promise.all([
    isAncestor(git, head, main.sha),
    mainCommits(git, base, main.sha, scope),
    commitPatchIds(git, `${base}..${main.sha}`, scope, "forward"),
    commitPatchIds(git, `${base}..${head}`, scope, "forward"),
    commitPatchIds(git, `${base}..${head}`, scope, "inverse"),
    wholePatchIds(git, base, head, scope),
  ]);
  if (isErr(reachable)) return reachable;
  if (!reachable.value && commits.value.length === 0) {
    return ok(
      unknownLanded(
        `the attempt has no commits between its base ${short(base)} and its cleared head ${short(head)}, and that head is not on ${main.branch}`,
      ),
    );
  }
  if (isErr(mainLog)) return mainLog;
  if (isErr(mainIds)) return mainIds;
  if (isErr(forwardIds)) return forwardIds;
  if (isErr(inverseIds)) return inverseIds;
  if (isErr(whole)) return whole;
  const evidence: Evidence = {
    main,
    head,
    base,
    commits: commits.value,
    scope,
    mainLog: mainLog.value,
    mainIds: mainIds.value,
    forwardIds: forwardIds.value,
    inverseIds: inverseIds.value,
    whole: whole.value,
  };
  const landing = landingOf(evidence, reachable.value);
  return landing.kind === "landing" ? undoOf(git, evidence, landing) : ok(landing);
}

export async function judgeLanded(
  git: RepoGit,
  main: MainSnapshot,
  head: string,
  base: string | undefined,
): Promise<Judged> {
  const present = await commitsPresent(git, base === undefined ? [head] : [head, base]);
  if (isErr(present)) return transient(present.error);
  const [headPresent, basePresent] = present.value;
  if (headPresent !== true) {
    return transient(
      `the cleared head ${short(head)} is gone from the repository; its branch is gone`,
    );
  }
  if (base === undefined) {
    return settled(
      unknownLanded(
        "the attempt recorded no base commit, so its change cannot be compared with main",
      ),
    );
  }
  if (basePresent !== true) {
    return transient(`the attempt's base ${short(base)} is gone from the repository`);
  }
  const descends = await isAncestor(git, base, head);
  if (isErr(descends)) return transient(descends.error);
  if (!descends.value) {
    return settled(
      unknownLanded(
        `the cleared head ${short(head)} does not descend from the attempt's base ${short(base)}`,
      ),
    );
  }
  const judged = await judgeAttempt(git, main, head, base);
  return isErr(judged) ? transient(judged.error) : settled(judged.value);
}

export async function landedOf(
  repoRoot: string,
  cleared: ClearedHead,
  run: GitRunner = boundedGit(),
): Promise<Landed> {
  if (cleared.kind === "unknown") return unknownLanded(cleared.because);
  const git = { repoRoot, run };
  const main = await mainSnapshotOf(git);
  if (isErr(main)) return unknownLanded(main.error);
  if (main.value === undefined) return unknownLanded(NO_MAIN_BRANCH);
  return (await judgeLanded(git, main.value, cleared.head, cleared.base)).landed;
}

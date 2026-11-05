import { isErr, ok, type Result } from "@phyxiusjs/fp";
import type { Outcome } from "ledger";
import {
  type CommitMessage,
  type CommitPatch,
  changedPaths,
  cherry,
  commitExists,
  commitMessages,
  commitPatches,
  commitsBetween,
  diffPatchId,
  isAncestor,
  mainBranchOf,
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
  | { readonly kind: "unknown"; readonly because: string };

export type ClearedHead =
  | { readonly kind: "known"; readonly head: string; readonly base: string | undefined }
  | { readonly kind: "unknown"; readonly because: string };

export type LandedReader = (cleared: ClearedHead) => Landed;

function unknown(because: string): Landed {
  return { kind: "unknown", because };
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

interface Landing {
  readonly by: LandedBy;
  readonly units: readonly (readonly string[])[];
}

const REVERT_TRAILER = /This reverts commit ([0-9a-f]{7,40})/g;

function revertedTargets(message: CommitMessage): readonly string[] {
  return [...message.message.matchAll(REVERT_TRAILER)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
}

function names(target: string, commit: string): boolean {
  return commit.startsWith(target);
}

function reverterOf(commit: string, messages: readonly CommitMessage[]): string | undefined {
  return messages.find((message) =>
    revertedTargets(message).some((target) => names(target, commit)),
  )?.commit;
}

function counterparts(
  attempt: readonly CommitPatch[],
  main: readonly CommitPatch[],
  commit: string,
): readonly string[] {
  const own = attempt.find((patch) => patch.commit === commit)?.patchId;
  return own === undefined
    ? []
    : main.filter((patch) => patch.patchId === own).map((patch) => patch.commit);
}

function landingOf(
  repoRoot: string,
  main: string,
  head: string,
  base: string,
  commits: readonly string[],
  mainPatches: readonly CommitPatch[],
): Result<Landing | Landed, string> {
  const reachable = isAncestor(repoRoot, head, main);
  if (isErr(reachable)) return reachable;
  if (reachable.value) return ok({ by: "ancestry", units: commits.map((commit) => [commit]) });

  if (commits.length === 0) {
    return ok(
      unknown(
        `the attempt has no commits between its base ${short(base)} and its cleared head ${short(head)}, and that head is not on ${main}`,
      ),
    );
  }

  const cherried = cherry(repoRoot, main, head, base);
  if (isErr(cherried)) return cherried;
  const missing = cherried.value.filter((entry) => !entry.onUpstream).length;
  if (missing === 0) {
    const attemptPatches = commitPatches(repoRoot, `${base}..${head}`, []);
    if (isErr(attemptPatches)) return attemptPatches;
    return ok({
      by: "patch",
      units: commits.map((commit) => [
        commit,
        ...counterparts(attemptPatches.value, mainPatches, commit),
      ]),
    });
  }

  const whole = diffPatchId(repoRoot, base, head);
  if (isErr(whole)) return whole;
  const squashes = mainPatches.filter((patch) => patch.patchId === whole.value);
  if (whole.value !== undefined && squashes.length > 0) {
    return ok({ by: "squash", units: [[...commits, ...squashes.map((patch) => patch.commit)]] });
  }

  const present = commits.length - missing;
  if (present > 0) {
    return ok(
      unknown(
        `${present} of the attempt's ${commits.length} commits are on ${main} and the rest are not, and its whole change matches no single commit there`,
      ),
    );
  }
  return ok({ kind: "not-on-main", main, head });
}

function isLanded(value: Landing | Landed): value is Landed {
  return "kind" in value;
}

function revertOf(
  repoRoot: string,
  main: string,
  head: string,
  base: string,
  landing: Landing,
  mainPatches: readonly CommitPatch[],
  messages: readonly CommitMessage[],
): Result<Landed, string> {
  const landedAt = Math.max(
    -1,
    ...landing.units.flat().map((commit) => mainPatches.findIndex((p) => p.commit === commit)),
  );
  const reverse = diffPatchId(repoRoot, head, base);
  if (isErr(reverse)) return reverse;
  const reversedWhole = mainPatches.find(
    (patch, index) => index > landedAt && patch.patchId === reverse.value,
  )?.commit;

  const unitReverters = landing.units.map((unit) =>
    unit.map((commit) => reverterOf(commit, messages)).find((reverter) => reverter !== undefined),
  );
  const reverters = unitReverters.filter((reverter) => reverter !== undefined);
  const revertedBy =
    reversedWhole ??
    (reverters.length > 0 && reverters.length === unitReverters.length
      ? reverters[reverters.length - 1]
      : undefined);

  if (revertedBy === undefined) {
    if (reverters.length > 0) {
      return ok(
        unknown(
          `${reverters.length} of the attempt's ${unitReverters.length} commits are reverted on ${main} and the rest are not`,
        ),
      );
    }
    return ok({ kind: "on-main", main, head, by: landing.by });
  }

  const reRevert = reverterOf(revertedBy, messages);
  if (reRevert !== undefined) {
    return ok(
      unknown(
        `it reached ${main} and ${short(revertedBy)} reverted it, but ${short(reRevert)} reverts that revert`,
      ),
    );
  }
  return ok({ kind: "reverted-on-main", main, head, revertedBy });
}

function judge(repoRoot: string, head: string, base: string | undefined): Result<Landed, string> {
  const main = mainBranchOf(repoRoot);
  if (isErr(main)) return main;
  if (main.value === undefined) {
    return ok(
      unknown(
        "no main branch: origin's HEAD names no local branch, and neither main nor master exists",
      ),
    );
  }
  const mainBranch = main.value;

  const headExists = commitExists(repoRoot, head);
  if (isErr(headExists)) return headExists;
  if (!headExists.value) {
    return ok(
      unknown(`the cleared head ${short(head)} is gone from the repository; its branch is gone`),
    );
  }
  if (base === undefined) {
    return ok(
      unknown("the attempt recorded no base commit, so its change cannot be compared with main"),
    );
  }
  const baseExists = commitExists(repoRoot, base);
  if (isErr(baseExists)) return baseExists;
  if (!baseExists.value) {
    return ok(unknown(`the attempt's base ${short(base)} is gone from the repository`));
  }
  const descends = isAncestor(repoRoot, base, head);
  if (isErr(descends)) return descends;
  if (!descends.value) {
    return ok(
      unknown(
        `the cleared head ${short(head)} does not descend from the attempt's base ${short(base)}`,
      ),
    );
  }

  const commits = commitsBetween(repoRoot, base, head);
  if (isErr(commits)) return commits;
  const paths = changedPaths(repoRoot, base, head);
  if (isErr(paths)) return paths;
  const mainRange = `${base}..${mainBranch}`;
  const mainPatches =
    paths.value.length === 0 ? ok([]) : commitPatches(repoRoot, mainRange, paths.value);
  if (isErr(mainPatches)) return mainPatches;

  const landing = landingOf(repoRoot, mainBranch, head, base, commits.value, mainPatches.value);
  if (isErr(landing)) return landing;
  if (isLanded(landing.value)) return ok(landing.value);

  const messages =
    paths.value.length === 0 ? ok([]) : commitMessages(repoRoot, mainRange, paths.value);
  if (isErr(messages)) return messages;
  return revertOf(
    repoRoot,
    mainBranch,
    head,
    base,
    landing.value,
    mainPatches.value,
    messages.value,
  );
}

export function landedOf(repoRoot: string, cleared: ClearedHead): Landed {
  if (cleared.kind === "unknown") return unknown(cleared.because);
  const judged = judge(repoRoot, cleared.head, cleared.base);
  return isErr(judged) ? unknown(judged.error) : judged.value;
}

export function mainLineReader(repoRoot: string): LandedReader {
  return (cleared) => landedOf(repoRoot, cleared);
}

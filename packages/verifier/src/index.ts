export type { FileDiff, HunkRange } from "./git.ts";
export {
  diffFiles,
  fileContentAt,
  isAncestor,
  isCommit,
  pathExistsAt,
} from "./git.ts";

export type { HunkCitation, HunkCitationRefusal } from "./hunkCitation.ts";
export { checkHunkCitation, parseHunkCitation } from "./hunkCitation.ts";

export { checkFoundAt } from "./foundAt.ts";

export { unexplainedMarks } from "./inverse.ts";

export {
  PLAIN_PROGRAMMING_ENGLISH,
  acceptedForms,
  extractWords,
  harnessVocabulary,
  vocabularyGaps,
} from "./vocabulary.ts";

export type { VerifyOptions, VerifyRefusal, VerifyResult } from "./verify.ts";
export {
  VERIFIER_GATE_ID,
  VERIFIER_VERSION,
  explainVerifyRefusal,
  verifyDebrief,
} from "./verify.ts";

export { renderVerification } from "./render.ts";

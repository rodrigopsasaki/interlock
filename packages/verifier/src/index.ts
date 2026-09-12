export { checkFoundAt } from "./foundAt.ts";
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

export { unexplainedMarks } from "./inverse.ts";
export { renderVerification } from "./render.ts";

export type { VerifyOptions, VerifyRefusal, VerifyResult } from "./verify.ts";
export {
  explainVerifyRefusal,
  VERIFIER_GATE_ID,
  VERIFIER_VERSION,
  verifyDebrief,
} from "./verify.ts";
export {
  acceptedForms,
  extractWords,
  harnessVocabulary,
  PLAIN_PROGRAMMING_ENGLISH,
  vocabularyGaps,
} from "./vocabulary.ts";

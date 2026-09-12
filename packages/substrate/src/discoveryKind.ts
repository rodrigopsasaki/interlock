import type { Discovery } from "ledger";
import type { ItemKind } from "debrief";

const TENSION = /\btension\b/i;
const ABSENCE =
  /\b(?:no|not|nothing|none|missing|nowhere|never|absent|lacks?|lacking)\b/i;
const CONFLICT =
  /\b(?:conflict|contradict|clash|disagree|mismatch|inconsistent|collide|versus)\b/i;

export function discoveryItemKind(discovery: Discovery): ItemKind {
  const text = `${discovery.what} ${discovery.matteredBecause}`;
  if (TENSION.test(text)) return "tension";
  if (ABSENCE.test(text)) return "absence";
  if (CONFLICT.test(text)) return "risk";
  return "decision";
}

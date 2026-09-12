import type { DebriefDerivation, Derivation } from "ledger";

export function derivationString(derivation: Derivation): string {
  switch (derivation.kind) {
    case "gate":
      return `gate:${derivation.gate}:${derivation.version}:${derivation.runner}`;
    case "model":
      return `model:${derivation.model}:${derivation.promptId}:${derivation.lens}`;
    case "human":
      return `human:${derivation.who}`;
  }
}

export function debriefDerivationString(derivation: DebriefDerivation): string {
  switch (derivation.kind) {
    case "agent":
      return `agent:${derivation.runtime}:${derivation.model}`;
    case "human":
      return `human:${derivation.who}`;
  }
}

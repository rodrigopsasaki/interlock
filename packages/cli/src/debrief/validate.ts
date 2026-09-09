export interface DebriefValidationOutcome {
  readonly kind: "not-implemented";
  readonly reason: string;
}

export function validateDebrief(): DebriefValidationOutcome {
  return {
    kind: "not-implemented",
    reason: "interlock debrief validate: not implemented yet; this command fails closed until a validator exists",
  };
}

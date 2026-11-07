export type FlagValue =
  | { readonly kind: "absent" }
  | { readonly kind: "value"; readonly value: string }
  | { readonly kind: "invalid"; readonly reason: "missing-value" };

export function parseFlagValue(args: readonly string[], flag: string): FlagValue {
  const index = args.indexOf(flag);
  if (index === -1) return { kind: "absent" };
  const value = args[index + 1];
  return value === undefined || value === "" || value.startsWith("--")
    ? { kind: "invalid", reason: "missing-value" }
    : { kind: "value", value };
}

export function parseFlag(args: readonly string[], flag: string): string | undefined {
  const parsed = parseFlagValue(args, flag);
  return parsed.kind === "value" ? parsed.value : undefined;
}

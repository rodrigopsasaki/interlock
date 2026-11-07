export function agentEnvironmentArgs(
  kind: string,
  args: readonly string[],
  env: Readonly<Record<string, string>>,
): readonly string[] {
  if (kind !== "codex") return args;
  return [
    ...args,
    ...Object.entries(env).flatMap(([key, value]) => [
      "-c",
      `shell_environment_policy.set.${/^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key)}=${JSON.stringify(value)}`,
    ]),
  ];
}

export function needsPaneEnvironment(kind: string): boolean {
  return kind !== "codex";
}

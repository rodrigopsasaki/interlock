import { RUNNER_MARKER_KEYS } from "../runnerMarker.ts";

function configKey(value: string): string {
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : JSON.stringify(value);
}

export function agentEnvironmentArgs(
  kind: string,
  args: readonly string[],
  env: Readonly<Record<string, string>>,
  stdioMcpServers: readonly string[] = [],
): readonly string[] {
  if (kind !== "codex") return args;
  return [
    ...args,
    ...Object.entries(env).flatMap(([key, value]) => [
      "-c",
      `shell_environment_policy.set.${configKey(key)}=${JSON.stringify(value)}`,
    ]),
    ...stdioMcpServers.flatMap((name) =>
      RUNNER_MARKER_KEYS.flatMap((key) => {
        const value = env[key];
        return value === undefined
          ? []
          : ["-c", `mcp_servers.${configKey(name)}.env.${configKey(key)}=${JSON.stringify(value)}`];
      }),
    ),
  ];
}

export function needsPaneEnvironment(kind: string): boolean {
  return kind !== "codex";
}

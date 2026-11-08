import { spawnSync } from "node:child_process";

const probe = process.env["INTERLOCK_PROBE_SCRIPT"];
const output = process.env["INTERLOCK_PROBE_OUTPUT"];
if (probe === undefined || output === undefined) process.exit(1);

const serverEnvironments = new Map();
for (let index = 0; index < process.argv.length; index += 1) {
  if (process.argv[index] !== "-c") continue;
  const setting = process.argv[index + 1];
  if (setting === undefined || !setting.startsWith("mcp_servers.")) continue;
  const environmentStart = setting.indexOf(".env.");
  if (environmentStart < 0) continue;
  const server = setting.slice("mcp_servers.".length, environmentStart);
  const assignment = setting.slice(environmentStart + ".env.".length);
  const equals = assignment.indexOf("=");
  if (equals < 0) continue;
  const key = assignment.slice(0, equals).replace(/^"|"$/g, "");
  const value = JSON.parse(assignment.slice(equals + 1));
  const environment = serverEnvironments.get(server) ?? {};
  environment[key] = value;
  serverEnvironments.set(server, environment);
}

for (const environment of serverEnvironments.values()) {
  const result = spawnSync(process.execPath, [probe, output], {
    env: { ...process.env, ...environment },
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

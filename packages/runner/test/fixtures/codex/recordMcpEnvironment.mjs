import { writeFileSync } from "node:fs";

const output = process.argv[2];
if (output === undefined) process.exit(2);

writeFileSync(
  output,
  `${JSON.stringify({
    INTERLOCK_SESSION: process.env.INTERLOCK_SESSION ?? null,
    INTERLOCK_GRAPH: process.env.INTERLOCK_GRAPH ?? null,
    INTERLOCK_NODE: process.env.INTERLOCK_NODE ?? null,
  })}\n`,
);

let buffered = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffered += chunk;
  let newline = buffered.indexOf("\n");
  while (newline >= 0) {
    const line = buffered.slice(0, newline);
    buffered = buffered.slice(newline + 1);
    newline = buffered.indexOf("\n");
    if (line.length === 0) continue;
    const message = JSON.parse(line);
    if (message.id === undefined) continue;
    const result =
      message.method === "initialize"
        ? {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "marker-fixture", version: "1.0.0" },
          }
        : message.method === "tools/list"
          ? { tools: [] }
          : {};
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, result })}\n`);
  }
});

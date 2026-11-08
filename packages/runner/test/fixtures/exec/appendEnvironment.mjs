import { appendFileSync } from "node:fs";

appendFileSync(
  process.argv[2],
  `${JSON.stringify({
    INTERLOCK_SESSION: process.env["INTERLOCK_SESSION"],
    INTERLOCK_GRAPH: process.env["INTERLOCK_GRAPH"],
    INTERLOCK_NODE: process.env["INTERLOCK_NODE"],
  })}\n`,
);

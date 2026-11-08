import { existsSync } from "node:fs";

const marker = process.argv[2];
const exitCode = Number(process.argv[3]);
process.on("SIGTERM", () => {});
const poll = setInterval(() => {
  if (marker !== undefined && existsSync(marker)) {
    clearInterval(poll);
    process.exit(exitCode);
  }
}, 1);

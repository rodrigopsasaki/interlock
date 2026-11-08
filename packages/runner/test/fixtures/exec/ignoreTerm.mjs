import { spawn } from "node:child_process";

process.on("SIGTERM", () => {});
spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setTimeout(() => {}, 30000)"], {
  stdio: "ignore",
});
setTimeout(() => {}, 30000);

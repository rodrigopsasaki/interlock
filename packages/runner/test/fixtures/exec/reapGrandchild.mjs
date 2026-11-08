import { spawn } from "node:child_process";

spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], {
  stdio: "ignore",
}).unref();

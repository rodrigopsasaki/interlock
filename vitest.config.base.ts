import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";

const gitCommonDirectory = execFileSync("git", ["rev-parse", "--git-common-dir"], {
  cwd: import.meta.dirname,
  encoding: "utf-8",
}).trim();
process.env["INTERLOCK_TEST_FORBIDDEN_ROOT"] = dirname(
  resolve(import.meta.dirname, gitCommonDirectory),
);

export const baseConfig = defineConfig({
  test: {
    globals: false,
    environment: "node",
    exclude: ["**/node_modules/**", "**/.runs/**"],
    setupFiles: ["../../vitest.setup.ts"],
  },
});

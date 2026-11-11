import { defineConfig } from "vitest/config";
import { baseConfig } from "../../vitest.config.base";

const setupFiles = baseConfig.test?.setupFiles;
const baseSetupFiles =
  setupFiles === undefined ? [] : Array.isArray(setupFiles) ? setupFiles : [setupFiles];
const fixtureRun = process.env["INTERLOCK_CODEX_FIXTURE"] === "1";

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    setupFiles: [...baseSetupFiles, "./test/support/codexGuardSetup.ts"],
    exclude: [...(baseConfig.test?.exclude ?? []), ...(fixtureRun ? [] : ["**/test/fixtures/**"])],
  },
});

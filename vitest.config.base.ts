import { defineConfig } from "vitest/config";

export const baseConfig = defineConfig({
  test: {
    globals: false,
    environment: "node",
  },
});

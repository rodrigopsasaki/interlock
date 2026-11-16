import { describe, expect, it } from "vitest";
import { createFixtureEnvironment } from "../src/fixtureEnv.ts";

describe("fixture environment", () => {
  it("keeps home, tool state, git identity and test limits under one temporary root", () => {
    const fixture = createFixtureEnvironment({
      testWorkers: 12,
      heapMb: 6144,
      baseEnv: { HOME: "/owner", PATH: "/bin" },
    });
    try {
      expect(fixture.env["HOME"]).toBe(`${fixture.root}/home`);
      expect(fixture.env["XDG_CONFIG_HOME"]).toBe(`${fixture.root}/xdg-config`);
      expect(fixture.env["MISE_STATE_DIR"]).toBe(`${fixture.root}/mise-state`);
      expect(fixture.env["COREPACK_HOME"]).toBe(`${fixture.root}/corepack`);
      expect(fixture.env["GIT_CONFIG_GLOBAL"]).toBe("/dev/null");
      expect(fixture.env["GIT_CONFIG_NOSYSTEM"]).toBe("1");
      expect(fixture.env["GIT_AUTHOR_NAME"]).toBe("interlock fixture");
      expect(fixture.env["GIT_COMMITTER_EMAIL"]).toBe("interlock-fixture@example.invalid");
      expect(fixture.env["VITEST_MAX_WORKERS"]).toBe("12");
      expect(fixture.env["NODE_OPTIONS"]).toBe("--max-old-space-size=6144");
    } finally {
      fixture.cleanup();
    }
  });
});

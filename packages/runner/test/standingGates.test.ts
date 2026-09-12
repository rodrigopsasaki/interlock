import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isErr, isOk } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import { loadStandingGates } from "../src/standingGates.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function fixtureRepo(configYaml: string): string {
  directory = mkdtempSync(join(runsRoot, "standing-"));
  mkdirSync(join(directory, ".interlock"), { recursive: true });
  writeFileSync(join(directory, ".interlock", "config.yaml"), configYaml);
  return directory;
}

describe("loadStandingGates", () => {
  it("reads each standing gate's id, kind and run", async () => {
    const repoRoot = fixtureRepo(
      [
        "interlock: config@v0",
        "standing_gates:",
        "  - id: typecheck",
        "    kind: command",
        "    run: pnpm typecheck",
        "",
      ].join("\n"),
    );
    const result = await loadStandingGates(repoRoot);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value).toEqual([{ id: "typecheck", kind: "command", run: "pnpm typecheck" }]);
  });

  it("refuses an entry that predates kind, naming the required shape", async () => {
    const repoRoot = fixtureRepo(
      [
        "interlock: config@v0",
        "standing_gates:",
        "  - id: typecheck",
        "    run: pnpm typecheck",
        "",
      ].join("\n"),
    );
    const result = await loadStandingGates(repoRoot);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.kind).toBe("malformed");
  });
});

describe("loadStandingGates expect_output", () => {
  it("compiles a declared pattern into a RegExp beside its command", async () => {
    const repoRoot = fixtureRepo(
      [
        "interlock: config@v0",
        "standing_gates:",
        "  - id: test",
        "    kind: command",
        "    run: pnpm test",
        "    expect_output: 'Tests +[1-9][0-9]* passed'",
        "",
      ].join("\n"),
    );

    const result = await loadStandingGates(repoRoot);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    const testGate = result.value.find((entry) => entry.id === "test");
    expect(testGate?.expectOutput?.source).toBe("Tests +[1-9][0-9]* passed");
    expect(testGate?.expectOutput?.test("Tests 3 passed")).toBe(true);
    expect(testGate?.expectOutput?.test("Tests 0 passed")).toBe(false);
  });

  it("leaves expect_output undefined when the field is absent", async () => {
    const repoRoot = fixtureRepo(
      [
        "interlock: config@v0",
        "standing_gates:",
        "  - id: typecheck",
        "    kind: command",
        "    run: pnpm typecheck",
        "",
      ].join("\n"),
    );

    const result = await loadStandingGates(repoRoot);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value).toEqual([{ id: "typecheck", kind: "command", run: "pnpm typecheck" }]);
  });

  it("refuses a malformed pattern with a sentence naming the gate", async () => {
    const repoRoot = fixtureRepo(
      [
        "interlock: config@v0",
        "standing_gates:",
        "  - id: test",
        "    kind: command",
        "    run: pnpm test",
        "    expect_output: '(unclosed'",
        "",
      ].join("\n"),
    );

    const result = await loadStandingGates(repoRoot);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.kind).toBe("malformed");
    if (result.error.kind !== "malformed") return;
    expect(result.error.reason).toContain("test");
    expect(result.error.reason).toContain("(unclosed");
  });
});

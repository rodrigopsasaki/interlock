import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDispatcher } from "../../src/face/dispatch.ts";

const FAKE_BIN = join(import.meta.dirname, "fixtures", "fakeBin.ts");

afterEach(() => {
  delete process.env["FAKE_BIN_EXIT_CODE"];
});

describe("createDispatcher", () => {
  it("spawns the given binary with exactly the given argv and reports its exit code", async () => {
    const dispatch = createDispatcher(FAKE_BIN);
    const result = await dispatch(["node", "cancel", "0001-bootstrap", "verbs"]);
    expect(result.exitCode).toBe(0);
    expect(result.lastLine).toBe("argv: node cancel 0001-bootstrap verbs");
  });

  it("reports a non-zero exit code the dispatched process chose", async () => {
    process.env["FAKE_BIN_EXIT_CODE"] = "3";
    const dispatch = createDispatcher(FAKE_BIN);
    const result = await dispatch(["sweep"]);
    expect(result.exitCode).toBe(3);
    expect(result.lastLine).toBe("argv: sweep");
  });

  it("reports the last non-empty line, not the full output, when the process writes several lines", async () => {
    const echoManyLines = join(import.meta.dirname, "fixtures", "manyLinesBin.ts");
    const dispatch = createDispatcher(echoManyLines);
    const result = await dispatch([]);
    expect(result.exitCode).toBe(0);
    expect(result.lastLine).toBe("last line");
  });
});

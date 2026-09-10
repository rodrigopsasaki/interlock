import { isErr, isOk } from "@phyxiusjs/fp";
import { describe, expect, it } from "vitest";
import { parseExpectOutput } from "../src/expectOutput.js";

describe("parseExpectOutput", () => {
  it("compiles a valid pattern", () => {
    const parsed = parseExpectOutput("Tests +[1-9][0-9]* passed");
    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;
    expect(parsed.value.test("Tests 3 passed")).toBe(true);
    expect(parsed.value.test("Tests 0 passed")).toBe(false);
  });

  it("refuses a malformed pattern, naming the reason", () => {
    const parsed = parseExpectOutput("(unclosed");
    expect(isErr(parsed)).toBe(true);
    if (!isErr(parsed)) return;
    expect(parsed.error.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";
import { isValidSubstrateAddress, substrateClientFor } from "../src/address.ts";

describe("isValidSubstrateAddress", () => {
  it("accepts none and http(s) addresses", () => {
    expect(isValidSubstrateAddress("none")).toBe(true);
    expect(isValidSubstrateAddress("http://localhost:4000")).toBe(true);
    expect(isValidSubstrateAddress("https://substrate.example.com")).toBe(true);
  });

  it("refuses anything else", () => {
    expect(isValidSubstrateAddress("localhost:4000")).toBe(false);
    expect(isValidSubstrateAddress("")).toBe(false);
    expect(isValidSubstrateAddress("ftp://example.com")).toBe(false);
  });
});

describe("substrateClientFor", () => {
  it("returns a client addressed at what it was given", () => {
    expect(substrateClientFor("none").address).toBe("none");
    expect(substrateClientFor("http://localhost:4000").address).toBe("http://localhost:4000");
  });
});

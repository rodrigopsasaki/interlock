import { describe, expect, it } from "vitest";
import { decodeKeys } from "../../src/face/keys.ts";

describe("decodeKeys", () => {
  it("decodes the arrow escape sequences to named keys", () => {
    expect(decodeKeys("\x1b[A")).toEqual([{ name: "up" }]);
    expect(decodeKeys("\x1b[B")).toEqual([{ name: "down" }]);
  });

  it("decodes a lone escape byte, not followed by an arrow sequence, to escape", () => {
    expect(decodeKeys("\x1b")).toEqual([{ name: "escape" }]);
    expect(decodeKeys("\x1b[Z")).toEqual([
      { name: "escape" },
      { name: "char", char: "[" },
      { name: "char", char: "Z" },
    ]);
  });

  it("decodes carriage return and newline to enter, and DEL/BS to backspace", () => {
    expect(decodeKeys("\r")).toEqual([{ name: "enter" }]);
    expect(decodeKeys("\n")).toEqual([{ name: "enter" }]);
    expect(decodeKeys("\x7f")).toEqual([{ name: "backspace" }]);
    expect(decodeKeys("\x08")).toEqual([{ name: "backspace" }]);
  });

  it("decodes every other byte as a printable char, one key per character", () => {
    expect(decodeKeys("aB?")).toEqual([
      { name: "char", char: "a" },
      { name: "char", char: "B" },
      { name: "char", char: "?" },
    ]);
  });

  it("decodes a chunk carrying several keys at once, in order", () => {
    expect(decodeKeys("j\x1b[Ak\r")).toEqual([
      { name: "char", char: "j" },
      { name: "up" },
      { name: "char", char: "k" },
      { name: "enter" },
    ]);
  });
});

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FACE_SRC = join(import.meta.dirname, "..", "src");

const FORBIDDEN: readonly RegExp[] = [/createLedger/, /attachLedgerSink/];

function listTsFiles(root: string): readonly string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return listTsFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("no-write-surface", () => {
  it("packages/face's dependency graph reaches neither createLedger nor attachLedgerSink", () => {
    const hits = listTsFiles(FACE_SRC).flatMap((path) => {
      const content = readFileSync(path, "utf-8");
      return FORBIDDEN.filter((pattern) => pattern.test(content)).map(
        (pattern) => `${path}: ${pattern}`,
      );
    });
    expect(hits).toEqual([]);
  });
});

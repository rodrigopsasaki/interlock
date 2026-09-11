import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RUNNER_SRC = join(import.meta.dirname, "..", "src");
const CLI_SRC = join(import.meta.dirname, "..", "..", "cli", "src");
const ADAPTER_FILE = join(RUNNER_SRC, "herdr", "adapter.ts");

const FORBIDDEN: readonly RegExp[] = [
  /workspace\.create/,
  /pane\.split/,
  /agent\.start/,
  /pane\.report_agent_session/,
  /pane\.report_agent\b/,
  /agent\.wait/,
  /agent\.read/,
  /agent\.list/,
  /pane\.list/,
  /pane\.close/,
  /pane\.focus\b/,
  /events\.subscribe/,
  /herdr\.sock/,
  /["']herdr["']/,
];

function listTsFiles(root: string): readonly string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return listTsFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("adapter-boundary", () => {
  it("keeps herdr's method names, socket path and CLI name inside the one adapter file", () => {
    const files = [...listTsFiles(RUNNER_SRC), ...listTsFiles(CLI_SRC)].filter(
      (path) => path !== ADAPTER_FILE,
    );

    const hits = files.flatMap((path) => {
      const content = readFileSync(path, "utf-8");
      return FORBIDDEN.filter((pattern) => pattern.test(content)).map(
        (pattern) => `${path}: ${pattern}`,
      );
    });

    expect(hits).toEqual([]);
  });

  it("the adapter file itself does reference herdr's method names", () => {
    const content = readFileSync(ADAPTER_FILE, "utf-8");
    expect(FORBIDDEN.some((pattern) => pattern.test(content))).toBe(true);
  });
});

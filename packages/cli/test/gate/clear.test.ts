import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runGateClear } from "../../src/gate/clear.ts";
import { gitInitFixture } from "../graph/gitFixture.ts";

const runsRoot = join(import.meta.dirname, "..", ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

const graphYaml = [
  "interlock: graph@v0",
  "id: demo",
  "gates:",
  "  - id: approved",
  "    kind: human",
  "nodes:",
  "  - id: a",
  "    depends_on: []",
  "    gates:",
  "      - id: own-gate",
  "        kind: command",
  '        run: "true"',
  "      - id: witnessed",
  "        kind: human",
  "",
].join("\n");

const configYaml = [
  "interlock: config@v0",
  "standing_gates:",
  "  - id: typecheck",
  "    kind: command",
  '    run: "true"',
  "",
].join("\n");

function fixture(): string {
  directory = mkdtempSync(join(runsRoot, "gate-clear-"));
  gitInitFixture(directory);
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  writeFileSync(join(directory, ".interlock", "graphs", "demo.yaml"), graphYaml);
  writeFileSync(join(directory, ".interlock", "config.yaml"), configYaml);
  return directory;
}

function journalEventKinds(cwd: string): readonly string[] {
  const raw = readFileSync(join(cwd, ".interlock", "ledger", "journal.jsonl"), "utf-8");
  return raw
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line): string => {
      const parsed: unknown = JSON.parse(line);
      return typeof parsed === "object" && parsed !== null && "kind" in parsed
        ? String(parsed["kind"])
        : "";
    });
}

describe("gate clear", () => {
  it("refuses without --because", async () => {
    const cwd = fixture();
    const result = await runGateClear(["demo", "a", "witnessed", "--by", "Rodrigo Sasaki"], {
      cwd,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toBe(
      "interlock gate clear: refuses without --because; every clearance records why.",
    );
  });

  it("refuses without --by", async () => {
    const cwd = fixture();
    const result = await runGateClear(
      ["demo", "a", "witnessed", "--because", "watched the brief render"],
      { cwd },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toBe(
      "interlock gate clear: refuses without --by; every clearance records who.",
    );
  });

  it("refuses on an unknown graph", async () => {
    const cwd = fixture();
    const result = await runGateClear(
      ["ghost", "a", "witnessed", "--by", "Rodrigo Sasaki", "--because", "witnessed it"],
      { cwd },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("no such file");
  });

  it("refuses on an unknown node", async () => {
    const cwd = fixture();
    const result = await runGateClear(
      ["demo", "ghost", "witnessed", "--by", "Rodrigo Sasaki", "--because", "witnessed it"],
      { cwd },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain('no node "ghost" declared on graph "demo"');
  });

  it("refuses on an unknown gate", async () => {
    const cwd = fixture();
    const result = await runGateClear(
      ["demo", "a", "ghost-gate", "--by", "Rodrigo Sasaki", "--because", "witnessed it"],
      { cwd },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toBe(
      'a: gate "ghost-gate" is not declared; declared gates are typecheck, own-gate, witnessed.',
    );
  });

  it("refuses a command gate, naming that it is met by its command, never by hand", async () => {
    const cwd = fixture();
    const result = await runGateClear(
      ["demo", "a", "own-gate", "--by", "Rodrigo Sasaki", "--because", "looks fine"],
      { cwd },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toBe(
      "a/own-gate: not a human gate; a command gate is met by its command, never by hand.",
    );
  });

  it("refuses a standing command gate the same way", async () => {
    const cwd = fixture();
    const result = await runGateClear(
      ["demo", "a", "typecheck", "--by", "Rodrigo Sasaki", "--because", "looks fine"],
      { cwd },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toBe(
      "a/typecheck: not a human gate; a command gate is met by its command, never by hand.",
    );
  });

  it("clears a human gate, writing exactly one gate-moved event carrying a human receipt", async () => {
    const cwd = fixture();
    const result = await runGateClear(
      [
        "demo",
        "a",
        "witnessed",
        "--by",
        "Rodrigo Sasaki",
        "--because",
        "watched the brief render and the debrief absorb",
      ],
      { cwd },
    );
    expect(result.exitCode).toBe(0);
    expect(result.message).toMatch(/^a\/witnessed: cleared by Rodrigo Sasaki \(receipt \w+\)\.$/);
    expect(journalEventKinds(cwd)).toEqual(["gate-moved"]);

    const raw = readFileSync(join(cwd, ".interlock", "ledger", "journal.jsonl"), "utf-8");
    const parsed: unknown = JSON.parse(raw.trim());
    if (typeof parsed !== "object" || parsed === null) throw new Error("expected an event");
    const to = (parsed as { to: unknown }).to;
    if (typeof to !== "object" || to === null) throw new Error("expected a gate state");
    const receipt = (to as { receipt: unknown }).receipt;
    if (typeof receipt !== "object" || receipt === null) throw new Error("expected a receipt");
    expect((receipt as { derivation: unknown }).derivation).toEqual({
      kind: "human",
      who: "Rodrigo Sasaki",
    });
    expect((receipt as { proof: unknown }).proof).toEqual({
      because: "watched the brief render and the debrief absorb",
    });
    expect((receipt as { spend: unknown }).spend).toEqual({ kind: "none" });
  });

  it("refuses to clear a gate already satisfied, naming the terminal rule", async () => {
    const cwd = fixture();
    await runGateClear(
      ["demo", "a", "witnessed", "--by", "Rodrigo Sasaki", "--because", "witnessed it"],
      { cwd },
    );

    const result = await runGateClear(
      ["demo", "a", "witnessed", "--by", "Rodrigo Sasaki", "--because", "witnessed it again"],
      { cwd },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toBe("a/witnessed: cannot move from satisfied, which is terminal.");
  });
});

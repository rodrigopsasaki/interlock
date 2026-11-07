import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ok } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import { parseCitation } from "../src/delegation.ts";
import { runGateClear } from "../src/gate/clear.ts";
import { runGraphApprove } from "../src/graph/approve.ts";
import { runReceiptRetract } from "../src/receipt/retract.ts";
import { gitInitFixture } from "./graph/gitFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
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

const localYaml = [
  "interlock: local@v1",
  "runtime:",
  "  kind: claude",
  "worktree_root: .worktrees",
  "lease_ms: 1000",
  "run_timeout_ms: 1000",
  "substrate:",
  "  address: none",
  "owner_login: rodrigopsasaki",
  "",
].join("\n");

function fixture(): { readonly cwd: string; readonly machine: string } {
  directory = mkdtempSync(join(runsRoot, "cited-approval-"));
  gitInitFixture(directory);
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  writeFileSync(join(directory, ".interlock", "graphs", "demo.yaml"), graphYaml);
  writeFileSync(join(directory, ".interlock", "config.yaml"), configYaml);
  writeFileSync(join(directory, ".interlock", "local.yaml"), localYaml);
  const provider = join(directory, "cite-provider.mjs");
  writeFileSync(
    provider,
    [
      "const [kind, id] = process.argv.slice(2);",
      "const author = kind === 'msg' ? 'Rodrigo Sasaki' : 'Rodrigo Sasaki';",
      "process.stdout.write(JSON.stringify({verified: true, author, words: kind + ':' + id + ' words', at: '2026-11-07T15:00:00Z'}));",
      "",
    ].join("\n"),
  );
  const machine = join(directory, "machine.yaml");
  writeFileSync(
    machine,
    [
      "interlock: machine@v0",
      "provider:",
      "  admit: [admit]",
      "  release: [release]",
      "  env: [env]",
      "  heavy: [heavy]",
      `  cite: [${JSON.stringify(process.execPath)}, ${JSON.stringify(provider)}, "{kind}", "{id}"]`,
      "",
    ].join("\n"),
  );
  return { cwd: directory, machine };
}

function journal(cwd: string): readonly Record<string, unknown>[] {
  const raw = readFileSync(join(cwd, ".interlock", "ledger", "journal.jsonl"), "utf8");
  return raw
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const parsed: unknown = JSON.parse(line);
      if (!isRecord(parsed)) {
        throw new Error("expected a journal object");
      }
      return parsed;
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

describe("cited delegation", () => {
  it("parses only the three exact citation forms", () => {
    expect(parseCitation("said:b-7f3c19")).toEqual({
      kind: "said",
      id: "b-7f3c19",
      literal: "said:b-7f3c19",
    });
    expect(parseCitation("msg:cmsg_01BN1q6CYuBjcZAFT6C2pgFdW7ADPkTH7KHoD9BQemQLYK")).toEqual({
      kind: "msg",
      id: "cmsg_01BN1q6CYuBjcZAFT6C2pgFdW7ADPkTH7KHoD9BQemQLYK",
      literal: "msg:cmsg_01BN1q6CYuBjcZAFT6C2pgFdW7ADPkTH7KHoD9BQemQLYK",
    });
    expect(
      parseCitation("https://github.com/acme/widgets/pull/4#issuecomment-6690704055"),
    ).toMatchObject({
      kind: "pull",
      owner: "acme",
      repository: "widgets",
      commentId: "6690704055",
    });
    expect(parseCitation("b-7f3c19")).toBeUndefined();
    expect(parseCitation("said:")).toBeUndefined();
    expect(parseCitation(" said:b-7f3c19")).toBeUndefined();
  });

  it("approves with a verified said citation and records separate readings", async () => {
    const { cwd, machine } = fixture();
    const result = await runGraphApprove(
      [
        "demo",
        "--by",
        "Gilb",
        "--because",
        "the owner asked for this graph",
        "--for",
        "Rodrigo Sasaki",
        "--cites",
        "said:b-7f3c19",
        "--reading",
        "I read the words as approval of demo",
      ],
      { cwd, machinePath: machine },
    );
    expect(result.exitCode).toBe(0);
    const event = journal(cwd).find((candidate) => candidate["kind"] === "gate-moved");
    expect(event).toBeDefined();
    expect(JSON.stringify(event)).toContain("Gilb for Rodrigo Sasaki");
    expect(JSON.stringify(event)).toContain("said:b-7f3c19");
    expect(JSON.stringify(event)).toContain("I read the words as approval of demo");
  });

  it("clears with a comment cite through the git-host adapter", async () => {
    const { cwd, machine } = fixture();
    const result = await runGateClear(
      [
        "demo",
        "a",
        "witnessed",
        "--by",
        "Gilb",
        "--because",
        "the owner witnessed it",
        "--for",
        "Rodrigo Sasaki",
        "--cites",
        "https://github.com/acme/widgets/pull/4#issuecomment-6690704055",
        "--reading",
        "I read the comment as clearance",
      ],
      {
        cwd,
        machinePath: machine,
        gitHost: {
          verifyComment: async () =>
            ok({
              key: "comment:node-1",
              author: "RODRIGOPSASAKI",
              words: "clear witnessed",
              at: "2026-11-07T15:00:00Z",
            }),
        },
      },
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.stringify(journal(cwd))).toContain("Gilb for Rodrigo Sasaki");
    expect(JSON.stringify(journal(cwd))).toContain("comment:node-1");
  });

  it("refuses malformed present flags without creating a ledger", async () => {
    const { cwd, machine } = fixture();
    const result = await runGraphApprove(
      ["demo", "--by", "Gilb", "--because", "why", "--for", "--cites", "said:x"],
      { cwd, machinePath: machine },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("--for must carry a value");
    expect(() => readFileSync(join(cwd, ".interlock", "ledger", "journal.jsonl"))).toThrow();
  });

  it("consumes a citation once and lets the owner retract the delegated approval", async () => {
    const { cwd, machine } = fixture();
    const args = [
      "demo",
      "--by",
      "Gilb",
      "--because",
      "why",
      "--for",
      "Rodrigo Sasaki",
      "--cites",
      "msg:one",
      "--reading",
      "approve demo",
    ];
    expect((await runGraphApprove(args, { cwd, machinePath: machine })).exitCode).toBe(0);
    const reused = await runGateClear(
      [
        "demo",
        "a",
        "witnessed",
        "--by",
        "Gilb",
        "--because",
        "why",
        "--for",
        "Rodrigo Sasaki",
        "--cites",
        "msg:one",
        "--reading",
        "clear witnessed",
      ],
      { cwd, machinePath: machine },
    );
    expect(reused.exitCode).not.toBe(0);
    expect(reused.message).toContain("already authorized approve");
    const retracted = await runReceiptRetract(
      ["demo", "--by", "Rodrigo Sasaki", "--because", "retract"],
      { cwd },
    );
    expect(retracted.exitCode).toBe(0);
    expect(JSON.stringify(journal(cwd))).toContain("receipt-retracted");
  });
});

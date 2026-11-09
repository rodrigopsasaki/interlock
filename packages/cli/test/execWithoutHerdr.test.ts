import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runGraphApprove } from "../src/graph/approve.ts";
import { runInterlockRun } from "../src/run.ts";
import { commitAll, gitInitFixture } from "./graph/gitFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;
let promptRecordPath: string | undefined;
const savedRuntimes = process.env["INTERLOCK_RUNTIMES"];
const savedPromptRecord = process.env["INTERLOCK_EXEC_PROMPTS"];

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
  if (promptRecordPath !== undefined) rmSync(promptRecordPath, { force: true });
  promptRecordPath = undefined;
  if (savedRuntimes === undefined) delete process.env["INTERLOCK_RUNTIMES"];
  else process.env["INTERLOCK_RUNTIMES"] = savedRuntimes;
  if (savedPromptRecord === undefined) delete process.env["INTERLOCK_EXEC_PROMPTS"];
  else process.env["INTERLOCK_EXEC_PROMPTS"] = savedPromptRecord;
});

const graph = [
  "interlock: graph@v0",
  "id: demo",
  "gates:",
  "  - id: approved",
  "    kind: human",
  "nodes:",
  "  - id: a",
  "    acceptance: a fixture exec node",
  "    gates: []",
  "",
].join("\n");

const config = ["interlock: config@v0", "standing_gates: []", ""].join("\n");

const local = [
  "interlock: local@v0",
  "runtime:",
  "  kind: claude",
  "  args: []",
  "worktree_root: .worktrees",
  "lease_ms: 60000",
  "run_timeout_ms: 5000",
  "substrate:",
  "  address: none",
  "",
].join("\n");

const brief = [
  "---",
  "interlock: brief@v1",
  "graph: demo",
  "node: a",
  "role: implementer",
  "gates: []",
  "scope:",
  "  - .interlock/config.yaml",
  "  - .interlock/graphs/demo.yaml",
  "  - .interlock/local.yaml",
  "  - .interlock/sessions/demo/a/brief.md",
  "substrate:",
  "  address: none",
  "---",
  "",
  "# brief",
  "",
  "## Acceptance (verbatim from the graph)",
  "",
  "> a fixture exec node",
  "",
].join("\n");

function fixture(): string {
  directory = mkdtempSync(join(runsRoot, "exec-without-herdr-"));
  const session = join(directory, ".interlock", "sessions", "demo", "a");
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  mkdirSync(session, { recursive: true });
  writeFileSync(join(directory, ".interlock", "graphs", "demo.yaml"), graph);
  writeFileSync(join(directory, ".interlock", "config.yaml"), config);
  writeFileSync(join(directory, ".interlock", "local.yaml"), local);
  writeFileSync(join(directory, ".gitignore"), "interlock/\n");
  writeFileSync(join(session, "brief.md"), brief);
  gitInitFixture(directory);
  commitAll(directory, "fixture repository");
  return directory;
}

function execCatalogue(program: string, script: string): string {
  return [
    "interlock: runtimes@v2",
    "runtimes:",
    "  fixture:",
    "    kind: exec",
    "    commits: agent",
    `    args: [${JSON.stringify(program)}, ${JSON.stringify(script)}, "{prompt}"]`,
    "    model: fixture",
    "",
  ].join("\n");
}

it("runs both exec phases without herdr and gives each phase its own argv prompt", async () => {
  const cwd = fixture();
  const script = join(cwd, "record-prompts.mjs");
  const record = join(runsRoot, `prompts-${process.pid}.txt`);
  promptRecordPath = record;
  writeFileSync(
    script,
    'import { appendFileSync } from "node:fs";\nappendFileSync(process.env.INTERLOCK_EXEC_PROMPTS, `${JSON.stringify(process.argv.at(-1))}\\n`);\n',
  );
  const catalogue = join(cwd, "runtimes.yaml");
  writeFileSync(catalogue, execCatalogue(process.execPath, script));
  commitAll(cwd, "add exec fixture");
  process.env["INTERLOCK_RUNTIMES"] = catalogue;
  process.env["INTERLOCK_EXEC_PROMPTS"] = record;
  await runGraphApprove(["demo", "--by", "Rodrigo Sasaki", "--because", "fixture"], { cwd });

  const result = await runInterlockRun(["demo", "a", "--runtime", "fixture"], { cwd });

  expect(result.exitCode).toBe(0);
  expect(existsSync(record)).toBe(true);
  const prompts = readFileSync(record, "utf8")
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(prompts).toHaveLength(2);
  expect(prompts[0]).not.toBe(prompts[1]);
  expect(prompts[0]).toContain("fixture exec node");
  expect(prompts[1]).toContain("File your debrief");
}, 30_000);

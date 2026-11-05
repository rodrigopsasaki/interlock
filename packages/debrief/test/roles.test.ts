import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isErr, isOk } from "@phyxiusjs/fp";
import {
  type Debrief,
  type DebriefKind,
  debriefKindsPresent,
  NODE_ROLES,
  type NodeRole,
} from "ledger";
import { afterEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { readDebriefDocument } from "../src/debrief.ts";
import { roleKindsRefusal } from "../src/roleKinds.ts";
import {
  defaultRoleTable,
  explainRoleTableRefusal,
  readRoleTable,
  roleTableOver,
} from "../src/roles.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

const SHA = "c".repeat(40);

function debriefWith(sections: readonly string[]): Debrief {
  const read = readDebriefDocument(
    [
      "interlock: debrief@v2",
      "graph: g",
      "node: n",
      "role: implementer",
      `graph_base_sha: ${SHA}`,
      `session_start_sha: ${SHA}`,
      `head_sha: ${SHA}`,
      "derivation:",
      "  kind: human",
      "  who: Rodrigo Sasaki",
      ...sections,
      "",
    ].join("\n"),
    "debrief.yaml",
  );
  if (!isOk(read) || read.value.kind !== "v2") throw new Error("expected a v2 debrief");
  return read.value.debrief;
}

const EMPTY = ["discoveries: []", "decisions: []", "gates_run_by_agent: []", "open: []"];

const DECISION_WITH_HUNK = [
  "discoveries: []",
  "decisions:",
  "  - id: d1",
  "    what: changed it",
  "    because: it was wrong",
  "    rests_on: [a.ts]",
  "    hunks: [a.ts:1-2]",
  "gates_run_by_agent: []",
  "open: []",
];

const DECISION_WITHOUT_HUNK = [
  "discoveries: []",
  "decisions:",
  "  - id: d1",
  "    what: chose to read only",
  "    because: the node changes nothing",
  "    rests_on: [a.ts]",
  "    hunks: []",
  "gates_run_by_agent: []",
  "open: []",
];

const DISCOVERY = [
  "discoveries:",
  "  - id: x1",
  "    what: found it",
  "    found_at: 'a.ts:1 \"x\"'",
  "    mattered_because: the brief did not say",
  "decisions: []",
  "gates_run_by_agent: []",
  "open: []",
];

const PROOF = [
  ...EMPTY,
  "proof:",
  "  - test: packages/a/test/a.test.ts",
  "    gate: a-proof",
  "    pins: an unknown role refuses with a sentence",
];

const FINDINGS = [
  ...EMPTY,
  "findings:",
  "  lens: security",
  "  items:",
  "    - id: f1",
  "      what: a token reaches the log",
  "      found_at: 'a.ts:3 \"log(token)\"'",
];

const GRAPH = [...EMPTY, "graph_file: .interlock/graphs/0047-next.yaml"];

const MARKS = [
  ...EMPTY,
  "marks:",
  "  - claim: node-role/closed-set-in-face",
  "    mark: rooted",
  "    because: its hunk is in the diff",
];

const exists = (): boolean => true;
const absent = (): boolean => false;

describe("roles@v0 required debrief kinds", () => {
  const expected: Readonly<
    Record<
      NodeRole,
      {
        readonly requires: readonly DebriefKind[];
        readonly forbids: readonly DebriefKind[];
        readonly returned: readonly string[];
        readonly heldWhenEmpty: string;
      }
    >
  > = {
    implementer: {
      requires: ["decisions", "hunks"],
      forbids: [],
      returned: DECISION_WITH_HUNK,
      heldWhenEmpty:
        "g/n is held: an implementer's debrief must return decisions and hunks and returns none (roles@v0).",
    },
    tester: {
      requires: ["proof"],
      forbids: [],
      returned: PROOF,
      heldWhenEmpty:
        "g/n is held: a tester's debrief must return proof and returns none (roles@v0).",
    },
    reviewer: {
      requires: ["findings"],
      forbids: ["hunks"],
      returned: FINDINGS,
      heldWhenEmpty:
        "g/n is held: a reviewer's debrief must return findings and returns none (roles@v0).",
    },
    scout: {
      requires: ["discoveries"],
      forbids: ["hunks"],
      returned: DISCOVERY,
      heldWhenEmpty:
        "g/n is held: a scout's debrief must return discoveries and returns none (roles@v0).",
    },
    planner: {
      requires: ["graph"],
      forbids: [],
      returned: GRAPH,
      heldWhenEmpty:
        "g/n is held: a planner's debrief must return graph and returns none (roles@v0).",
    },
    verifier: {
      requires: ["marks"],
      forbids: [],
      returned: MARKS,
      heldWhenEmpty:
        "g/n is held: a verifier's debrief must return marks and returns none (roles@v0).",
    },
  };

  it.each(NODE_ROLES)(
    "names the kinds a %s requires and forbids, and passes when it returns them",
    (role) => {
      const entry = defaultRoleTable[role];
      expect(entry.debrief.requires).toEqual(expected[role].requires);
      expect(entry.debrief.forbids).toEqual(expected[role].forbids);
      expect(
        roleKindsRefusal(role, entry, debriefWith(expected[role].returned), exists),
      ).toBeUndefined();
    },
  );

  it.each(NODE_ROLES)(
    "holds a %s debrief that returns none of its kinds with a sentence",
    (role) => {
      expect(roleKindsRefusal(role, defaultRoleTable[role], debriefWith(EMPTY), exists)).toBe(
        expected[role].heldWhenEmpty,
      );
    },
  );

  it("holds an implementer whose decisions cite no hunk", () => {
    expect(
      roleKindsRefusal(
        "implementer",
        defaultRoleTable.implementer,
        debriefWith(DECISION_WITHOUT_HUNK),
        exists,
      ),
    ).toBe("g/n is held: an implementer's debrief must return hunks and returns none (roles@v0).");
  });

  it("holds a reviewer that returns a diff", () => {
    const sections = [...FINDINGS.slice(EMPTY.length), ...DECISION_WITH_HUNK];
    expect(
      roleKindsRefusal("reviewer", defaultRoleTable.reviewer, debriefWith(sections), exists),
    ).toBe("g/n is held: a reviewer's debrief must return no hunks and returns some (roles@v0).");
  });

  it("holds a scout that returns a diff", () => {
    const sections = [...DISCOVERY.slice(0, 5), ...DECISION_WITH_HUNK.slice(1)];
    expect(roleKindsRefusal("scout", defaultRoleTable.scout, debriefWith(sections), exists)).toBe(
      "g/n is held: a scout's debrief must return no hunks and returns some (roles@v0).",
    );
  });

  it("holds a planner whose graph_file is not in the worktree, naming it", () => {
    expect(roleKindsRefusal("planner", defaultRoleTable.planner, debriefWith(GRAPH), absent)).toBe(
      "g/n is held: a planner's debrief must return graph and returns none, and its graph_file .interlock/graphs/0047-next.yaml is not in the worktree (roles@v0).",
    );
  });

  it("reads every role section and reports the kinds present", () => {
    expect(debriefKindsPresent(debriefWith(PROOF))).toEqual(["proof"]);
    expect(debriefKindsPresent(debriefWith(FINDINGS))).toEqual(["findings"]);
    expect(debriefKindsPresent(debriefWith(GRAPH))).toEqual(["graph"]);
    expect(debriefKindsPresent(debriefWith(MARKS))).toEqual(["marks"]);
    expect(debriefKindsPresent(debriefWith(DECISION_WITH_HUNK))).toEqual(["decisions", "hunks"]);
    expect(debriefKindsPresent(debriefWith(EMPTY))).toEqual([]);
    expect(debriefWith(FINDINGS).findings).toEqual({
      lens: "security",
      items: [{ id: "f1", what: "a token reaches the log", foundAt: 'a.ts:3 "log(token)"' }],
    });
  });

  it("refuses a findings section that names no lens", () => {
    const read = readDebriefDocument(
      [
        "interlock: debrief@v2",
        "graph: g",
        "node: n",
        "role: reviewer",
        `graph_base_sha: ${SHA}`,
        `session_start_sha: ${SHA}`,
        `head_sha: ${SHA}`,
        "derivation: { kind: human, who: Rodrigo Sasaki }",
        ...EMPTY,
        "findings:",
        "  items: []",
        "",
      ].join("\n"),
      "debrief.yaml",
    );
    if (!isErr(read)) throw new Error("expected a refusal");
    expect(read.error).toEqual({
      kind: "invalid-shape",
      path: "debrief.yaml",
      reason: '"findings" must name its "lens" as a non-empty string',
    });
  });
});

describe("roles@v0 table", () => {
  it("is the package default when the repository has no .interlock/roles.yaml", async () => {
    directory = mkdtempSync(join(runsRoot, "roles-"));
    const table = await readRoleTable(directory);
    if (!isOk(table)) throw new Error("expected the default table");
    expect(table.value).toBe(defaultRoleTable);
  });

  it("overlays a repository's .interlock/roles.yaml field by field, keeping every other role", async () => {
    directory = mkdtempSync(join(runsRoot, "roles-"));
    mkdirSync(join(directory, ".interlock"));
    writeFileSync(
      join(directory, ".interlock", "roles.yaml"),
      [
        "interlock: roles@v0",
        "roles:",
        "  reviewer:",
        "    prompt: Your role is reviewer through the security lens.",
        "    walk:",
        "      - verb: context",
        "        ask: Which secrets does this repository hold?",
        "  tester:",
        "    debrief:",
        "      requires: [proof, decisions]",
        "",
      ].join("\n"),
    );
    const table = await readRoleTable(directory);
    if (!isOk(table)) throw new Error("expected the overlaid table");
    expect(table.value.reviewer).toEqual({
      prompt: "Your role is reviewer through the security lens.",
      debrief: defaultRoleTable.reviewer.debrief,
      walk: [{ verb: "context", ask: "Which secrets does this repository hold?" }],
    });
    expect(table.value.tester).toEqual({
      ...defaultRoleTable.tester,
      debrief: { requires: ["proof", "decisions"], forbids: [] },
    });
    expect(table.value.implementer).toBe(defaultRoleTable.implementer);
  });

  it.each([
    [["interlock: roles@v1", "roles: {}"], 'shape tag is "roles@v1", expected "roles@v0"'],
    [
      ["interlock: roles@v0", "roles:", "  reviwer: { prompt: x }"],
      'role "reviwer" is not one of scout, planner, implementer, tester, reviewer, verifier; the nearest is "reviewer"',
    ],
    [
      ["interlock: roles@v0", "roles:", "  tester: { debrief: { requires: [tests] } }"],
      '"roles.tester.debrief.requires" names "tests", which is not one of discoveries, decisions, hunks, proof, findings, graph, marks',
    ],
    [
      ["interlock: roles@v0", "roles:", "  scout: { walk: [{ verb: search, ask: x }] }"],
      "roles.scout.walk must be a list of { verb, ask }, verb one of context, vocabulary, absorb",
    ],
  ])("refuses a malformed override with a sentence", (lines, reason) => {
    const parsed = roleTableOver(defaultRoleTable, parseYaml(lines.join("\n")));
    if (!isErr(parsed)) throw new Error("expected a refusal");
    expect(parsed.error).toBe(reason);
    expect(explainRoleTableRefusal({ kind: "invalid-shape", path: "roles.yaml", reason })).toBe(
      `roles.yaml: ${reason}`,
    );
  });
});

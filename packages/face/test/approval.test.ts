import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { unwrap } from "@phyxiusjs/fp";
import {
  createReceipt,
  derivation,
  duration,
  fold,
  gate,
  nodeKey,
  receiptId,
  spend,
  type LedgerEvent,
} from "ledger";
import { afterEach, describe, expect, it } from "vitest";
import type { GraphDocument } from "../src/document.ts";
import { positionOf } from "../src/position.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined)
    rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("stale-approval", () => {
  it("flips an approved graph to stale once the graph file changes by one byte", async () => {
    directory = mkdtempSync(join(runsRoot, "run-"));
    const path = join(directory, "graph.yaml");
    writeFileSync(
      path,
      [
        "interlock: graph@v0",
        "id: demo",
        "gates:",
        "  - id: approved",
        "    kind: human",
        "nodes: []",
        "",
      ].join("\n"),
    );

    const document: GraphDocument = {
      id: "demo",
      gates: [{ id: "approved", kind: "human" }],
      nodes: [],
    };

    const approvedReceipt = unwrap(
      await createReceipt(
        directory,
        ["graph.yaml"],
        "approved",
        "deadbeef",
        spend.none(),
        duration.unknown(),
        derivation.human("Rodrigo Sasaki"),
        { because: "approved for the stale-approval test" },
      ),
    );

    const node = { graph: document.id, id: document.id };
    const events: readonly LedgerEvent[] = [
      { kind: "node-created", node },
      {
        kind: "gate-moved",
        node,
        gate: "approved",
        to: gate.satisfied(approvedReceipt),
      },
    ];
    const projection = fold(events);
    expect(projection.nodes.get(nodeKey(node))?.gates.get("approved")).toEqual(
      gate.satisfied(approvedReceipt),
    );

    const contentHashBeforeEdit = unwrap(
      await receiptId(directory, ["graph.yaml"], "approved"),
    );
    expect(
      positionOf(document, projection, contentHashBeforeEdit, Date.now()).approval,
    ).toBe("approved");

    writeFileSync(
      path,
      `${["interlock: graph@v0", "id: demo", "gates:", "  - id: approved", "    kind: human", "nodes: []", ""].join("\n")} `,
    );

    const contentHashAfterEdit = unwrap(
      await receiptId(directory, ["graph.yaml"], "approved"),
    );
    expect(contentHashAfterEdit).not.toBe(contentHashBeforeEdit);
    expect(
      positionOf(document, projection, contentHashAfterEdit, Date.now()).approval,
    ).toBe("stale");
  });
});

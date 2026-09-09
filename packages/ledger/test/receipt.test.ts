import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { derivation } from "../src/derivation.js";
import {
  checkStale,
  createReceipt,
  isReceipt,
  receiptId,
} from "../src/receipt.js";
import { spend } from "../src/spend.js";

const packageJson = join(import.meta.dirname, "..", "package.json");
const tsconfigJson = join(import.meta.dirname, "..", "tsconfig.json");

describe("receipt identity", () => {
  it("is the same for the same scope and gate", async () => {
    const first = await receiptId([packageJson], "typecheck");
    const second = await receiptId([packageJson], "typecheck");
    expect(first).toBe(second);
  });

  it("differs when the gate differs", async () => {
    const typecheck = await receiptId([packageJson], "typecheck");
    const test = await receiptId([packageJson], "test");
    expect(typecheck).not.toBe(test);
  });

  it("differs when the scope's content differs", async () => {
    const withPackageJson = await receiptId([packageJson], "typecheck");
    const withTsconfig = await receiptId([tsconfigJson], "typecheck");
    expect(withPackageJson).not.toBe(withTsconfig);
  });

  it("is unaffected by scope order", async () => {
    const forward = await receiptId([packageJson, tsconfigJson], "typecheck");
    const backward = await receiptId([tsconfigJson, packageJson], "typecheck");
    expect(forward).toBe(backward);
  });
});

describe("createReceipt", () => {
  it("carries the commit SHA as history, not identity", async () => {
    const atOneCommit = await createReceipt(
      [packageJson],
      "typecheck",
      "aaa",
      spend.none(),
      derivation.gate("typecheck", "1", "r"),
      {},
    );
    const atAnotherCommit = await createReceipt(
      [packageJson],
      "typecheck",
      "bbb",
      spend.none(),
      derivation.gate("typecheck", "1", "r"),
      {},
    );
    expect(atOneCommit.id).toBe(atAnotherCommit.id);
    expect(atOneCommit.commitSha).toBe("aaa");
    expect(atAnotherCommit.commitSha).toBe("bbb");
  });

  it("keeps an empty proof distinct from no proof declared", async () => {
    const receipt = await createReceipt(
      [packageJson],
      "typecheck",
      "aaa",
      spend.none(),
      derivation.gate("typecheck", "1", "r"),
      {},
    );
    expect(receipt.proof).toEqual({});
    expect(isReceipt(receipt)).toBe(true);
  });
});

describe("checkStale", () => {
  it("is undefined when the scope still hashes to the receipt's id", async () => {
    const receipt = await createReceipt(
      [packageJson],
      "typecheck",
      "aaa",
      spend.none(),
      derivation.gate("typecheck", "1", "r"),
      {},
    );
    expect(await checkStale(receipt, [packageJson])).toBeUndefined();
  });

  it("reports the recomputed id when the scope's content has moved on", async () => {
    const receipt = await createReceipt(
      [packageJson],
      "typecheck",
      "aaa",
      spend.none(),
      derivation.gate("typecheck", "1", "r"),
      {},
    );
    const stale = await checkStale(receipt, [tsconfigJson]);
    expect(stale?.receipt).toBe(receipt);
    expect(stale?.recomputedId).not.toBe(receipt.id);
  });
});

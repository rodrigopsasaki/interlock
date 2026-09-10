import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isErr, unwrap } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import { derivation } from "../src/derivation.js";
import {
  checkStale,
  createReceipt,
  duration,
  isReceipt,
  receiptId,
} from "../src/receipt.js";
import { spend } from "../src/spend.js";

const packageRoot = join(import.meta.dirname, "..");
const packageJson = "package.json";
const tsconfigJson = "tsconfig.json";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let scratchDirs: string[] = [];

afterEach(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
  scratchDirs = [];
});

function checkoutWith(content: string): string {
  const dir = mkdtempSync(join(runsRoot, "run-"));
  scratchDirs.push(dir);
  mkdirSync(join(dir, "pkg"), { recursive: true });
  writeFileSync(join(dir, "pkg", "file.txt"), content);
  return dir;
}

describe("receipt identity", () => {
  it("is the same for the same scope and gate", async () => {
    const first = unwrap(
      await receiptId(packageRoot, [packageJson], "typecheck"),
    );
    const second = unwrap(
      await receiptId(packageRoot, [packageJson], "typecheck"),
    );
    expect(first).toBe(second);
  });

  it("differs when the gate differs", async () => {
    const typecheck = unwrap(
      await receiptId(packageRoot, [packageJson], "typecheck"),
    );
    const test = unwrap(await receiptId(packageRoot, [packageJson], "test"));
    expect(typecheck).not.toBe(test);
  });

  it("differs when the scope's content differs", async () => {
    const withPackageJson = unwrap(
      await receiptId(packageRoot, [packageJson], "typecheck"),
    );
    const withTsconfig = unwrap(
      await receiptId(packageRoot, [tsconfigJson], "typecheck"),
    );
    expect(withPackageJson).not.toBe(withTsconfig);
  });

  it("is unaffected by scope order", async () => {
    const forward = unwrap(
      await receiptId(packageRoot, [packageJson, tsconfigJson], "typecheck"),
    );
    const backward = unwrap(
      await receiptId(packageRoot, [tsconfigJson, packageJson], "typecheck"),
    );
    expect(forward).toBe(backward);
  });

  it("is the same for byte-identical files at the same relative path in two different checkouts", async () => {
    const content = "identical content, two different absolute roots\n";
    const checkoutA = checkoutWith(content);
    const checkoutB = checkoutWith(content);
    expect(checkoutA).not.toBe(checkoutB);

    const idFromA = unwrap(
      await receiptId(checkoutA, ["pkg/file.txt"], "typecheck"),
    );
    const idFromB = unwrap(
      await receiptId(checkoutB, ["pkg/file.txt"], "typecheck"),
    );
    expect(idFromA).toBe(idFromB);
  });

  it("still changes when one byte under the scope changes", async () => {
    const checkout = checkoutWith("original content\n");
    const before = unwrap(
      await receiptId(checkout, ["pkg/file.txt"], "typecheck"),
    );
    writeFileSync(join(checkout, "pkg", "file.txt"), "original content!\n");
    const after = unwrap(
      await receiptId(checkout, ["pkg/file.txt"], "typecheck"),
    );
    expect(after).not.toBe(before);
  });

  it("refuses an absolute scope path instead of silently hashing it", async () => {
    const refused = await receiptId(
      packageRoot,
      [join(packageRoot, packageJson)],
      "typecheck",
    );
    expect(isErr(refused)).toBe(true);
    if (isErr(refused)) expect(refused.error.kind).toBe("absolute-path");
  });

  it("refuses a relative scope path that resolves outside the root", async () => {
    const refused = await receiptId(
      packageRoot,
      ["../outside.txt"],
      "typecheck",
    );
    expect(isErr(refused)).toBe(true);
    if (isErr(refused)) expect(refused.error.kind).toBe("escapes-root");
  });
});

describe("createReceipt", () => {
  it("carries the commit SHA as history, not identity", async () => {
    const atOneCommit = unwrap(
      await createReceipt(
        packageRoot,
        [packageJson],
        "typecheck",
        "aaa",
        spend.none(),
        duration.measured(1_204),
        derivation.gate("typecheck", "1", "r"),
        {},
      ),
    );
    const atAnotherCommit = unwrap(
      await createReceipt(
        packageRoot,
        [packageJson],
        "typecheck",
        "bbb",
        spend.none(),
        duration.measured(1_204),
        derivation.gate("typecheck", "1", "r"),
        {},
      ),
    );
    expect(atOneCommit.id).toBe(atAnotherCommit.id);
    expect(atOneCommit.commitSha).toBe("aaa");
    expect(atAnotherCommit.commitSha).toBe("bbb");
  });

  it("keeps an empty proof distinct from no proof declared", async () => {
    const receipt = unwrap(
      await createReceipt(
        packageRoot,
        [packageJson],
        "typecheck",
        "aaa",
        spend.none(),
        duration.measured(1_204),
        derivation.gate("typecheck", "1", "r"),
        {},
      ),
    );
    expect(receipt.proof).toEqual({});
    expect(isReceipt(receipt)).toBe(true);
  });

  it("carries a typed unknown duration for a gate with nothing measured, such as a human's", async () => {
    const receipt = unwrap(
      await createReceipt(
        packageRoot,
        [packageJson],
        "approved",
        "aaa",
        spend.none(),
        duration.unknown(),
        derivation.human("Rodrigo Sasaki"),
        {},
      ),
    );
    expect(receipt.duration).toEqual({ kind: "unknown" });
    expect(isReceipt(receipt)).toBe(true);
  });

  it("refuses to build a receipt over an absolute scope path", async () => {
    const refused = await createReceipt(
      packageRoot,
      [join(packageRoot, packageJson)],
      "typecheck",
      "aaa",
      spend.none(),
      duration.measured(1),
      derivation.gate("typecheck", "1", "r"),
      {},
    );
    expect(isErr(refused)).toBe(true);
  });
});

describe("checkStale", () => {
  it("is undefined when the scope still hashes to the receipt's id", async () => {
    const receipt = unwrap(
      await createReceipt(
        packageRoot,
        [packageJson],
        "typecheck",
        "aaa",
        spend.none(),
        duration.measured(1_204),
        derivation.gate("typecheck", "1", "r"),
        {},
      ),
    );
    expect(
      unwrap(await checkStale(receipt, packageRoot, [packageJson])),
    ).toBeUndefined();
  });

  it("reports the recomputed id when the scope's content has moved on", async () => {
    const receipt = unwrap(
      await createReceipt(
        packageRoot,
        [packageJson],
        "typecheck",
        "aaa",
        spend.none(),
        duration.measured(1_204),
        derivation.gate("typecheck", "1", "r"),
        {},
      ),
    );
    const stale = unwrap(
      await checkStale(receipt, packageRoot, [tsconfigJson]),
    );
    expect(stale?.receipt).toBe(receipt);
    expect(stale?.recomputedId).not.toBe(receipt.id);
  });

  it("reports stale, not a false match, when a one-byte edit lands under the scope", async () => {
    const checkout = checkoutWith("original content\n");
    const receipt = unwrap(
      await createReceipt(
        checkout,
        ["pkg/file.txt"],
        "typecheck",
        "aaa",
        spend.none(),
        duration.measured(1),
        derivation.gate("typecheck", "1", "r"),
        {},
      ),
    );
    writeFileSync(join(checkout, "pkg", "file.txt"), "original content!\n");
    const stale = unwrap(await checkStale(receipt, checkout, ["pkg/file.txt"]));
    expect(stale?.receipt).toBe(receipt);
    expect(stale?.recomputedId).not.toBe(receipt.id);
  });
});

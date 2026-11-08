import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isErr, isOk } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import { migrateArcs } from "../../src/arcs/migrate.ts";
import { readArcsRegistry } from "../../src/arcs/reader.ts";

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture(content: string): Promise<string> {
  const root = await mkdtemp(join(import.meta.dirname, ".runs", "arcs-"));
  roots.push(root);
  await mkdir(join(root, ".interlock"));
  await writeFile(join(root, ".interlock", "arcs.yaml"), content, "utf-8");
  return root;
}

describe("arcs migration", () => {
  it("adds identity, keeps comments and values, and moves a marked shared listing to context", async () => {
    const ask = "the owner's exact ask stays here even when it is long";
    const source = "chat source stays byte for byte";
    const root = await fixture(
      `interlock: arcs@v0\n# preserved comment\narcs:\n  - id: a\n    title: A\n    ask: "${ask}"\n    source: "${source}"\n    graphs:\n      - example/shared\n  - id: b\n    title: B\n    ask: B\n    source: chat\n    graphs:\n      - example/shared (shared with a)\n`,
    );

    const migrated = await migrateArcs(root, "example");
    expect(isOk(migrated)).toBe(true);
    const raw = await readFile(join(root, ".interlock", "arcs.yaml"), "utf-8");
    expect(raw).toContain("# preserved comment");
    expect(raw).toContain(`ask: "${ask}"`);
    expect(raw).toContain(`source: "${source}"`);
    expect(raw).toContain("repository: example");

    const read = await readArcsRegistry(root);
    expect(isOk(read)).toBe(true);
    if (isOk(read)) {
      expect(read.value.version).toBe("arcs@v1");
      expect(read.value.arcs[1]?.graphs).toEqual([]);
      expect(read.value.arcs[1]?.context).toEqual([
        { graph: "example/shared", because: "shared with a" },
      ]);
    }
  });

  it("refuses non-empty needs_his_words and missing identity", async () => {
    const content = `interlock: arcs@v0\narcs:\n  - id: a\n    title: A\n    ask: A\n    source: chat\n    graphs:\n      - example/a\nneeds_his_words:\n  - graph: example/orphan\n    found: later\n`;
    const root = await fixture(content);
    const needsWords = await migrateArcs(root, "example");
    expect(isErr(needsWords) && needsWords.error).toContain("example/orphan");
    const identityRoot = await fixture(content.replace(/needs_his_words:[\s\S]*$/, ""));
    const noIdentity = await migrateArcs(identityRoot);
    expect(isErr(noIdentity) && noIdentity.error).toContain(
      "interlock arcs migrate --repository <name>",
    );
  });

  it("leaves v1 bytes unchanged", async () => {
    const content = "interlock: arcs@v1\nrepository: example\narcs: []\n";
    const root = await fixture(content);
    const migrated = await migrateArcs(root);
    expect(isOk(migrated)).toBe(true);
    expect(await readFile(join(root, ".interlock", "arcs.yaml"), "utf-8")).toBe(content);
  });
});

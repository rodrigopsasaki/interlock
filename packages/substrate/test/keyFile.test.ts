import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isErr, isOk } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import { readBearerToken } from "../src/keyFile.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function fixtureDirectory(): string {
  directory = mkdtempSync(join(runsRoot, "key-"));
  return directory;
}

describe("readBearerToken", () => {
  it("reads the first line of the key file as the token", async () => {
    const dir = fixtureDirectory();
    const path = join(dir, "key");
    writeFileSync(path, "s3cr3t\nignored second line\n");

    const read = await readBearerToken(path);
    expect(isOk(read)).toBe(true);
    if (!isOk(read)) return;
    expect(read.value).toBe("s3cr3t");
  });

  it("refuses a missing key file rather than sending an unauthenticated request", async () => {
    const dir = fixtureDirectory();
    const read = await readBearerToken(join(dir, "no-such-file"));
    expect(isErr(read)).toBe(true);
  });

  it("refuses a key file whose first line is empty", async () => {
    const dir = fixtureDirectory();
    const path = join(dir, "key");
    writeFileSync(path, "\n");

    const read = await readBearerToken(path);
    expect(isErr(read)).toBe(true);
  });
});

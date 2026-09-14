import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { isErr, isOk } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import {
  type FakeSubstrateServer,
  startFakeSubstrateServer,
} from "../../substrate/test/support/fakeSubstrateServer.ts";
import { repositoryForOrigin, substrateClientForRepository } from "../src/repositoryOrigin.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;
let server: FakeSubstrateServer | undefined;

afterEach(async () => {
  if (server !== undefined) await server.close();
  server = undefined;
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("repositoryForOrigin", () => {
  it.each([
    ["https://forge.example/owner/name.git", "https://forge.example/owner/name.git"],
    ["ssh://git@forge.example/owner/name.git", "ssh://forge.example/owner/name.git"],
    ["git@forge.example:owner/name.git", "ssh://forge.example/owner/name.git"],
  ])("reads owner and name from %s", (origin, originUrl) => {
    const result = repositoryForOrigin(origin);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual({ owner: "owner", name: "name", originUrl });
    }
  });

  it.each([
    "https://token@forge.example/owner/name.git",
    "https://user:password@forge.example/owner/name.git",
    "https://forge.example/owner/name.git?token=secret",
    "https://forge.example/owner/name.git#secret",
    "git@forge.example:owner/name.git?token=secret",
    "git@forge.example:owner/name.git#fragment",
    "https://forge.example/owner/name/extra.git",
    "not-an-origin",
  ])("refuses malformed or credential-bearing origins without echoing them", (origin) => {
    const result = repositoryForOrigin(origin);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error).not.toContain(origin);
  });
});

describe("substrateClientForRepository", () => {
  it("keeps none mode free of Git origin resolution", async () => {
    const client = await substrateClientForRepository("/does/not/exist", "none", undefined, true);

    expect(await client.context({ graph: "g", id: "n" }, [], "worker")).toEqual({ kind: "empty" });
  });

  it("refuses an enabled missing origin before issuing HTTP", async () => {
    directory = mkdtempSync(join(runsRoot, "origin-"));
    execFileSync("git", ["init", "--quiet"], { cwd: directory });
    server = await startFakeSubstrateServer();

    const client = await substrateClientForRepository(directory, server.url, undefined, true);
    const outcome = await client.context({ graph: "g", id: "n" }, [], "worker");

    expect(outcome.kind).toBe("refused");
    expect(server.calls).toHaveLength(0);
  });
});

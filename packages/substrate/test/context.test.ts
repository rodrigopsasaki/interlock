import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { substrateClientFor } from "../src/address.ts";
import { narrateContext } from "../src/narrate.ts";
import {
  startFakeSubstrateServer,
  type FakeSubstrateServer,
} from "./support/fakeSubstrateServer.ts";
import { fixtureItem } from "./support/fixtures.ts";

const node = { graph: "0003-translator", id: "substrate-client" };

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let server: FakeSubstrateServer | undefined;
let keyDirectory: string | undefined;

afterEach(async () => {
  if (server !== undefined) await server.close();
  server = undefined;
  if (keyDirectory !== undefined)
    rmSync(keyDirectory, { recursive: true, force: true });
  keyDirectory = undefined;
});

function keyFileWithToken(token: string): string {
  keyDirectory = mkdtempSync(join(runsRoot, "key-"));
  const path = join(keyDirectory, "key");
  writeFileSync(path, `${token}\n`);
  return path;
}

describe("context", () => {
  it("renders a slice of items and the substrate's vocabulary from a schema-valid response", async () => {
    server = await startFakeSubstrateServer();
    server.responseFor("context", {
      items: [fixtureItem],
      vocabulary: "reference@v1",
    });

    const client = substrateClientFor(server.url);
    const outcome = await client.context(
      node,
      ["packages/substrate"],
      "worker",
    );

    expect(outcome).toEqual({
      kind: "rendered",
      items: [fixtureItem],
      vocabulary: "reference@v1",
    });
    expect(narrateContext(server.url, outcome)).toBe(
      `context ${server.url}: 1 item(s), vocabulary reference@v1`,
    );
    expect(server.calls).toHaveLength(1);
    expect(server.calls[0]?.body).toEqual({
      node,
      scope: ["packages/substrate"],
      role: "worker",
    });
  });

  it("posts the bearer token from key_file as an Authorization header", async () => {
    server = await startFakeSubstrateServer();
    server.responseFor("context", { items: [], vocabulary: "reference@v1" });
    const keyFile = keyFileWithToken("s3cr3t");

    const client = substrateClientFor(server.url, keyFile);
    await client.context(node, [], "worker");

    expect(server.calls[0]?.authorization).toBe("Bearer s3cr3t");
  });

  it("refuses with a sentence naming the JSON pointer when the response fails its schema", async () => {
    server = await startFakeSubstrateServer();
    server.responseFor("context", {
      items: "not a list",
      vocabulary: "reference@v1",
    });

    const client = substrateClientFor(server.url);
    const outcome = await client.context(node, [], "worker");

    expect(outcome.kind).toBe("refused");
    if (outcome.kind !== "refused") return;
    expect(outcome.because).toContain("/items");
  });

  it("refuses, never throws, when a missing key file would otherwise send an unauthenticated request", async () => {
    server = await startFakeSubstrateServer();
    server.responseFor("context", { items: [], vocabulary: "reference@v1" });

    const client = substrateClientFor(server.url, "/no/such/key/file");
    const outcome = await client.context(node, [], "worker");

    expect(outcome.kind).toBe("refused");
    expect(server.calls).toHaveLength(0);
  });

  it("degrades to a none client's empty slice when the address is none", async () => {
    const client = substrateClientFor("none");
    const outcome = await client.context(node, [], "worker");
    expect(outcome).toEqual({ kind: "empty" });
    expect(narrateContext("none", outcome)).toBe(
      "context none: no substrate addressed",
    );
  });
});

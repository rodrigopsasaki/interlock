import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { substrateClientFor } from "../src/address.ts";
import { narrateContext } from "../src/narrate.ts";
import {
  type FakeSubstrateServer,
  startFakeSubstrateServer,
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
  if (keyDirectory !== undefined) rmSync(keyDirectory, { recursive: true, force: true });
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
    const outcome = await client.context(node, ["packages/substrate"], "worker");

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

  it("requires context refusal detail that the old non-2xx early return dropped", async () => {
    server = await startFakeSubstrateServer();
    server.responseFor("context", { error: { message: "role is not permitted" } }, 403);

    const client = substrateClientFor(server.url);
    const outcome = await client.context(node, [], "worker");

    expect(outcome).toEqual({
      kind: "refused",
      because: `context ${server.url}: HTTP 403: role is not permitted`,
    });
    expect(narrateContext(server.url, outcome)).toBe(
      `context ${server.url}: refused, context ${server.url}: HTTP 403: role is not permitted`,
    );
  });

  it("keeps a received context refusal's plain-text detail after terminal controls are normalized", async () => {
    server = await startFakeSubstrateServer();
    server.rawResponseFor("context", "slow\u001b[2J\nrequest", 429, "text/plain; charset=utf-8");

    const client = substrateClientFor(server.url);
    const outcome = await client.context(node, [], "worker");

    expect(outcome).toEqual({
      kind: "refused",
      because: `context ${server.url}: HTTP 429: slow request`,
    });
  });

  it("keeps the status without serializing empty, malformed, unrecognized, or arbitrary JSON response bodies", async () => {
    server = await startFakeSubstrateServer();
    const client = substrateClientFor(server.url);

    server.rawResponseFor("context", "", 500, "text/plain");
    const empty = await client.context(node, [], "worker");
    expect(empty).toEqual({ kind: "refused", because: `context ${server.url}: HTTP 500` });

    server.rawResponseFor("context", '{"error":', 502, "application/json");
    const malformed = await client.context(node, [], "worker");
    expect(malformed).toEqual({ kind: "refused", because: `context ${server.url}: HTTP 502` });

    server.responseFor("context", { error: { message: { detail: "not a string" } } }, 503);
    const arbitraryJson = await client.context(node, [], "worker");
    expect(arbitraryJson).toEqual({
      kind: "refused",
      because: `context ${server.url}: HTTP 503`,
    });

    server.rawResponseFor(
      "context",
      '{"error":{"message":"hidden"}}',
      415,
      "application/octet-stream",
    );
    const unrecognized = await client.context(node, [], "worker");
    expect(unrecognized).toEqual({ kind: "refused", because: `context ${server.url}: HTTP 415` });
  });

  it("bounds context refusal detail and marks intake and display truncation", async () => {
    server = await startFakeSubstrateServer();
    server.rawResponseFor("context", "x".repeat(2_048), 413, "text/plain");

    const client = substrateClientFor(server.url);
    const outcome = await client.context(node, [], "worker");

    expect(outcome.kind).toBe("refused");
    if (outcome.kind !== "refused") return;
    const detail = outcome.because.split("HTTP 413: ")[1];
    expect(detail).toHaveLength(512);
    expect(detail).toContain("body limited to 1024 bytes");
    expect(detail).toContain("detail truncated at 512 characters");
  });

  it("redacts echoed bearer tokens, including a token prefix at the intake boundary", async () => {
    server = await startFakeSubstrateServer();
    const token = "context-echo-token";
    const keyFile = keyFileWithToken(token);
    const client = substrateClientFor(server.url, keyFile);

    server.rawResponseFor("context", `denied ${token}`, 401, "text/plain");
    const echoed = await client.context(node, [], "worker");
    expect(echoed.kind).toBe("refused");
    if (echoed.kind !== "refused") return;
    expect(echoed.because).toContain("[redacted]");
    expect(echoed.because).not.toContain(token);

    const prefix = token.slice(0, -1);
    server.rawResponseFor(
      "context",
      `${"x".repeat(1024 - prefix.length)}${prefix}`,
      401,
      "text/plain",
    );
    const boundary = await client.context(node, [], "worker");
    expect(boundary.kind).toBe("refused");
    if (boundary.kind !== "refused") return;
    expect(boundary.because).not.toContain(prefix);
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
    expect(narrateContext("none", outcome)).toBe("context none: no substrate addressed");
  });
});

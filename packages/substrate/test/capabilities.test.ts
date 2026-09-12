import { afterEach, describe, expect, it } from "vitest";
import { substrateClientFor } from "../src/address.ts";
import {
  startFakeSubstrateServer,
  type FakeSubstrateServer,
} from "./support/fakeSubstrateServer.ts";

let server: FakeSubstrateServer | undefined;

afterEach(async () => {
  if (server !== undefined) await server.close();
  server = undefined;
});

describe("capabilities", () => {
  it("discovers the declared capabilities once and caches them across calls", async () => {
    server = await startFakeSubstrateServer();
    server.responseFor("capabilities", { capabilities: ["consult", "query"] });

    const client = substrateClientFor(server.url);
    await expect(client.capabilities()).resolves.toEqual(["consult", "query"]);
    await expect(client.capabilities()).resolves.toEqual(["consult", "query"]);

    expect(
      server.calls.filter((call) => call.verb === "capabilities"),
    ).toHaveLength(1);
  });

  it("degrades to no capabilities when the response is malformed", async () => {
    server = await startFakeSubstrateServer();
    server.responseFor("capabilities", { capabilities: ["not-a-real-one"] });

    const client = substrateClientFor(server.url);
    await expect(client.capabilities()).resolves.toEqual([]);
  });

  it("declares no capabilities for the none address", async () => {
    const client = substrateClientFor("none");
    await expect(client.capabilities()).resolves.toEqual([]);
  });
});

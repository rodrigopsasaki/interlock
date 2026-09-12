import { describe, expect, it } from "vitest";
import { noneClient } from "../src/noneClient.ts";
import {
  fixtureDebrief,
  fixtureNotes,
  fixtureReceipt,
} from "./support/fixtures.ts";

const node = { graph: "0003-translator", id: "substrate-client" };

describe("noneClient", () => {
  it("renders nothing on context and declares no capabilities", async () => {
    const client = noneClient();
    expect(client.address).toBe("none");
    await expect(client.context(node, [], "worker")).resolves.toEqual({
      kind: "empty",
    });
    await expect(client.capabilities()).resolves.toEqual([]);
  });

  it("absorbs nothing while everything still runs", async () => {
    const client = noneClient();
    await expect(
      client.absorb(node, fixtureDebrief, fixtureNotes, [fixtureReceipt]),
    ).resolves.toEqual({ kind: "empty" });
  });
});

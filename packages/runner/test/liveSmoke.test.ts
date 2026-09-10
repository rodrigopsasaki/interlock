import { existsSync } from "node:fs";
import { isErr } from "@phyxiusjs/fp";
import { describe, it } from "vitest";
import {
  createHerdrRuntime,
  defaultHerdrSocketPath,
} from "../src/herdr/adapter.ts";

// herdr's server starts only when a client attaches; this session never starts or configures
// it, so the socket may legitimately be absent. Skip with a sentence rather than fail.
describe("live smoke", () => {
  it("connects to the real herdr socket if one is present, or skips honestly", async () => {
    const socketPath = defaultHerdrSocketPath();
    if (!existsSync(socketPath)) {
      console.log(
        `live smoke: skipped, no herdr socket at ${socketPath} (herdr was not started).`,
      );
      return;
    }

    const created = await createHerdrRuntime(socketPath);
    if (isErr(created)) {
      throw new Error(
        `live smoke: herdr socket exists at ${socketPath} but the adapter could not connect: ${created.error.kind}.`,
      );
    }
  });
});

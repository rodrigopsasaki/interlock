import type { Discovery } from "ledger";
import { describe, expect, it } from "vitest";
import { discoveryItemKind } from "../src/discoveryKind.ts";

function discovery(what: string, matteredBecause = "test"): Discovery {
  return { id: "d1", what, foundAt: "some/path.ts", matteredBecause };
}

describe("discoveryItemKind", () => {
  it("names tension when the discovery's own words say so, ahead of any other match", () => {
    expect(
      discoveryItemKind(
        discovery("a tension between two conventions, no rule picks one"),
      ),
    ).toBe("tension");
  });

  it("names absence when the discovery names something missing", () => {
    expect(
      discoveryItemKind(discovery("packages/ledger has no arm for a mark")),
    ).toBe("absence");
    expect(
      discoveryItemKind(discovery("no field exists for a domain vocabulary")),
    ).toBe("absence");
    expect(
      discoveryItemKind(
        discovery("the sibling package never got its own entry"),
      ),
    ).toBe("absence");
  });

  it("names risk when the discovery names a conflict, with no absence or tension wording", () => {
    expect(
      discoveryItemKind(discovery("the two schemas disagree on the shape")),
    ).toBe("risk");
    expect(
      discoveryItemKind(
        discovery("a mismatch between the fixture and the real server"),
      ),
    ).toBe("risk");
  });

  it("defaults to decision when neither vocabulary matches", () => {
    expect(
      discoveryItemKind(
        discovery("every real run sprayed several git fatal lines to stderr"),
      ),
    ).toBe("decision");
  });

  it("scans only 'what', never 'mattered_because' -- a because's own hedging never flips the kind", () => {
    expect(
      discoveryItemKind(
        discovery(
          "every real run sprayed several git fatal lines to stderr",
          "recorded rather than hidden, since this is not a bug and marks never block",
        ),
      ),
    ).toBe("decision");
  });
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isErr, ok } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import { verifyCitation } from "../src/delegation.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

const owner = "configured-owner";
const by = "delegating-agent";
const comment = "https://github.com/acme/widgets/pull/4#issuecomment-6690704055";

function fixture(providerOutput: string): { readonly cwd: string; readonly machine: string } {
  directory = mkdtempSync(join(runsRoot, "neutral-refusal-"));
  mkdirSync(join(directory, ".interlock"), { recursive: true });
  writeFileSync(
    join(directory, ".interlock", "local.yaml"),
    [
      "interlock: local@v1",
      "runtime:",
      "  kind: claude",
      "worktree_root: .worktrees",
      "lease_ms: 1000",
      "run_timeout_ms: 1000",
      "substrate:",
      "  address: none",
      `owner_login: ${owner}`,
      "",
    ].join("\n"),
  );
  const provider = join(directory, "cite-provider.mjs");
  writeFileSync(provider, `process.stdout.write(${JSON.stringify(providerOutput)});\n`);
  const machine = join(directory, "machine.yaml");
  writeFileSync(
    machine,
    [
      "interlock: machine@v0",
      "provider:",
      "  admit: [admit]",
      "  release: [release]",
      "  env: [env]",
      "  heavy: [heavy]",
      "  cite:",
      `    - ${JSON.stringify(process.execPath)}`,
      `    - ${JSON.stringify(provider)}`,
      "    - '{kind}'",
      "    - '{id}'",
      "",
    ].join("\n"),
  );
  return { cwd: directory, machine };
}

async function expectNeutralRefusal(
  literal: string,
  options: Parameters<typeof verifyCitation>[5] = {},
): Promise<void> {
  const result = await verifyCitation(directory ?? ".", owner, by, literal, "clear", options);
  expect(isErr(result)).toBe(true);
  if (!isErr(result)) return;
  expect(result.error).toContain(owner);
  expect(result.error).not.toMatch(/\b(his|her|him|he|she)\b/i);
}

describe("neutral delegation refusals", () => {
  it("names the configured owner for an unknown cite", async () => {
    directory = mkdtempSync(join(runsRoot, "neutral-refusal-unknown-"));
    await expectNeutralRefusal("not-a-cite");
  });

  it("names the configured owner when a comment has another author", async () => {
    fixture("{}");
    await expectNeutralRefusal(comment, {
      gitHost: {
        verifyComment: async () =>
          ok({
            key: "comment:other",
            author: "another-author",
            words: "not the owner's words",
            at: "2026-11-08T00:00:00Z",
          }),
      },
    });
  });

  it("names the configured owner when the cite provider does not verify", async () => {
    const { machine } = fixture(
      JSON.stringify({ verified: false, author: owner, words: "not verified", at: "now" }),
    );
    await expectNeutralRefusal("said:unverified", { machinePath: machine });
  });

  it("names the configured owner when the cite provider names another author", async () => {
    const { machine } = fixture(
      JSON.stringify({
        verified: true,
        author: "another-author",
        words: "not the owner's words",
        at: "now",
      }),
    );
    await expectNeutralRefusal("said:another-author", { machinePath: machine });
  });
});

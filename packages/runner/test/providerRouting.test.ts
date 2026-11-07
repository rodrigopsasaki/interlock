import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isErr } from "@phyxiusjs/fp";
import {
  emptyProjection,
  type LedgerProjection,
  type ProviderHeadroom,
  replayFromRaw,
} from "ledger";
import { afterEach, describe, expect, it } from "vitest";
import { readClaudeHeadroom } from "../src/claude/headroom.ts";
import { readCodexHeadroom } from "../src/codex/headroom.ts";
import { readKimiHeadroom } from "../src/kimi/headroom.ts";
import { loadLocalConfig } from "../src/localConfig.ts";
import { type RoutingOptions, routeRuntime } from "../src/providerRouting.ts";
import type { MergedRuntimes, ResolvedRuntime } from "../src/runtimeCatalogue.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function directory(): string {
  const path = mkdtempSync(join(runsRoot, "routing-"));
  directories.push(path);
  return path;
}
function profile(provider: string, routable = true): ResolvedRuntime {
  return {
    name: provider,
    provider,
    ...(routable ? { routable: true } : {}),
    kind: provider,
    model: "m",
    commits: "runner",
    args: [],
    startupAnswers: [],
    startupTimeoutMs: 1,
    promptTakenTimeoutMs: 1,
    readySettleMs: 0,
    promptRetries: 0,
    writableRootArgs: undefined,
    source: "catalogue",
  };
}
function catalogue(providers = ["anthropic", "a", "b"]): MergedRuntimes {
  return {
    runtimes: new Map(providers.map((provider) => [provider, profile(provider)])),
    defaultRuntime: undefined,
  };
}
const unknown: ProviderHeadroom = { state: "unknown", reason: "no allowance" };
function known(fraction: number): ProviderHeadroom {
  return {
    state: "known",
    fraction,
    raw: (1 - fraction) * 100,
    unit: "percent used",
    source: "fixture",
  };
}
async function chosen(
  merged: MergedRuntimes,
  options: RoutingOptions = {},
  ledger = emptyProjection(),
  requested?: string,
): Promise<ResolvedRuntime> {
  const result = await routeRuntime(merged, requested, ledger, {
    readHeadroom: () => Promise.resolve(unknown),
    ...options,
  });
  if (isErr(result)) throw new Error(result.error.kind);
  return result.value;
}
function fixtureLedger(providers: readonly string[]): LedgerProjection {
  const path = join(directory(), "journal.jsonl");
  writeFileSync(
    path,
    `${providers
      .map((provider, index) =>
        JSON.stringify({
          interlock: "event@v10",
          kind: "session-started",
          session: {
            id: `s${index}`,
            node: { graph: "g", id: "n" },
            runtime: {
              name: provider,
              kind: provider,
              model: "m",
              provider,
              chosenBy: { kind: "explicit" },
            },
          },
          brief: { graph: "g", node: "n", role: "worker", acceptance: "x", gates: [], scope: [] },
        }),
      )
      .join("\n")}\n`,
  );
  const replayed = replayFromRaw(readFileSync(path, "utf-8"));
  if (isErr(replayed)) throw new Error("fixture did not replay");
  return replayed.value;
}

describe("provider routing", () => {
  it("round-robins unknown readings from a fixture ledger, never from process memory", async () => {
    expect((await chosen(catalogue(), {}, fixtureLedger(["a"]))).provider).toBe("b");
    expect((await chosen(catalogue(), {}, fixtureLedger(["a", "b"]))).provider).toBe("a");
    expect((await chosen(catalogue(), {}, fixtureLedger(["b", "a"]))).provider).toBe("b");
    expect((await chosen(catalogue())).provider).toBe("a");
    expect((await chosen(catalogue())).provider).toBe("a");
  });
  it("uses provider_order for never-attempted providers and catalogue order for unlisted ones", async () => {
    expect((await chosen(catalogue(), { providerOrder: ["b", "a"] })).provider).toBe("b");
    expect((await chosen(catalogue(), { providerOrder: ["missing"] })).provider).toBe("a");
  });
  it("highest known fraction beats unknown and provider_order, with equal fractions round-robin", async () => {
    const readHeadroom = async (kind: string) =>
      kind === "a" ? known(0.2) : kind === "b" ? known(0.8) : known(1);
    const selected = await chosen(catalogue(), { readHeadroom, providerOrder: ["a"] });
    expect(selected.provider).toBe("b");
    expect(selected.chosenBy).toMatchObject({
      kind: "routed",
      candidates: [
        { provider: "anthropic", headroom: known(1) },
        { provider: "a", headroom: known(0.2) },
        { provider: "b", headroom: known(0.8) },
      ],
    });
    expect(
      (
        await chosen(
          catalogue(),
          { readHeadroom: async (kind) => (kind === "a" ? known(0.1) : unknown) },
          fixtureLedger(["a"]),
        )
      ).provider,
    ).toBe("a");
    expect(
      (await chosen(catalogue(), { readHeadroom: async () => known(0.5) }, fixtureLedger(["a"])))
        .provider,
    ).toBe("b");
  });
  it("protects the default last resort even when it has the greatest fraction", async () => {
    const selected = await chosen(catalogue(), {
      readHeadroom: async (kind) => known(kind === "anthropic" ? 1 : 0.1),
    });
    expect(selected.provider).toBe("a");
  });
  it("uses the last resort only when sole or every other provider is exhausted", async () => {
    const sole = await chosen(catalogue(["anthropic"]));
    expect(sole.chosenBy).toMatchObject({
      kind: "last-resort",
      because: expect.stringContaining("sole"),
    });
    const exhausted = await chosen(catalogue(), {
      readHeadroom: async (kind) => (kind === "anthropic" ? unknown : known(0)),
    });
    expect(exhausted.provider).toBe("anthropic");
    expect(exhausted.chosenBy).toMatchObject({
      kind: "last-resort",
      because: expect.stringContaining("every other"),
    });
  });
  it("honors configured last_resort", async () => {
    expect(
      (await chosen(catalogue(), { lastResort: "a", providerOrder: ["a", "b", "anthropic"] }))
        .provider,
    ).toBe("b");
  });
  it("current rate limiting excludes a provider despite positive or unknown headroom", async () => {
    for (const headroom of [known(0.9), unknown]) {
      expect(
        (
          await chosen(catalogue(), {
            readHeadroom: async (kind) =>
              kind === "a" ? { ...headroom, rateLimited: true } : unknown,
          })
        ).provider,
      ).toBe("b");
    }
    expect(
      isErr(
        await routeRuntime(catalogue(), undefined, emptyProjection(), {
          readHeadroom: async () => known(0),
        }),
      ),
    ).toBe(true);
  });
  it("explicit wins without reading headroom, including an exhausted or nonroutable profile", async () => {
    let reads = 0;
    const selected = await chosen(
      catalogue(),
      {
        readHeadroom: async () => {
          reads += 1;
          return known(0);
        },
      },
      emptyProjection(),
      "anthropic",
    );
    expect(selected.chosenBy).toEqual({ kind: "explicit" });
    expect(selected.provider).toBe("anthropic");
    expect(reads).toBe(0);
    const nonroutable = profile("manual", false);
    const manual = await chosen(
      { runtimes: new Map([["manual", nonroutable]]), defaultRuntime: undefined },
      {},
      emptyProjection(),
      "manual",
    );
    expect(manual.chosenBy).toEqual({ kind: "explicit" });
    expect(isErr(await routeRuntime(catalogue(), "missing", emptyProjection()))).toBe(true);
  });
  it("falls back to the existing default resolution only when no profile opts in", async () => {
    const legacy = profile("default", false);
    const configured = profile("configured", false);
    for (const defaultRuntime of [undefined, "configured"]) {
      const merged: MergedRuntimes = {
        runtimes: new Map([
          ["default", legacy],
          ["configured", configured],
        ]),
        defaultRuntime,
      };
      const selected = await chosen(merged);
      expect(selected.name).toBe(defaultRuntime ?? "default");
      expect(selected.chosenBy).toMatchObject({
        kind: "fallback",
        because: expect.stringContaining("no routable"),
      });
    }
  });
  it("reads each candidate once per selection and never caches past it", async () => {
    let reads = 0;
    const readHeadroom = async () => {
      reads += 1;
      return unknown;
    };
    await chosen(catalogue(), { readHeadroom });
    expect(reads).toBe(3);
    await chosen(catalogue(), { readHeadroom });
    expect(reads).toBe(6);
  });
});

describe("local headroom adapters", () => {
  function event(primary: unknown, secondary?: unknown, limited: unknown = null): string {
    return JSON.stringify({
      type: "event_msg",
      payload: {
        type: "token_count",
        rate_limits: { primary, secondary, rate_limit_reached_type: limited },
      },
    });
  }
  it("reads a provider's own allowance with raw units and source, taking the tightest active window", async () => {
    const root = directory();
    const path = join(root, "rollout-fixture.jsonl");
    writeFileSync(
      path,
      `${event({ used_percent: 20, resets_at: 2000 }, { used_percent: 90, resets_at: 2000 })}\n`,
    );
    expect(await readCodexHeadroom(root, 1000)).toMatchObject({
      state: "known",
      fraction: 0.1,
      raw: 90,
      unit: "percent used",
      source: expect.stringContaining(`${path} payload.rate_limits.secondary`),
    });
    writeFileSync(
      path,
      event({ used_percent: 50, resets_at: 2000 }) +
        "\n" +
        event({ used_percent: 100, resets_at: 2000 }, undefined, "primary") +
        "\n",
    );
    expect(await readCodexHeadroom(root, 1000)).toMatchObject({
      state: "known",
      fraction: 0,
      rateLimited: true,
    });
  });
  it("finds allowance before a long conversation and picks report time over file time", async () => {
    const root = directory();
    const newest = join(root, "rollout-newest.jsonl");
    const old = join(root, "rollout-old.jsonl");
    const reported = (timestamp: string, used: number) =>
      JSON.stringify({
        timestamp,
        type: "event_msg",
        payload: {
          type: "token_count",
          rate_limits: { primary: { used_percent: used, resets_at: 2000 } },
        },
      });
    writeFileSync(
      newest,
      reported("2026-11-06T12:00:00Z", 25) +
        "\n" +
        JSON.stringify({ conversation: "x".repeat(1024 * 1024 + 1) }) +
        "\n",
    );
    writeFileSync(old, `${reported("2026-11-05T12:00:00Z", 90)}\n`);
    expect(await readCodexHeadroom(root, 1000)).toMatchObject({
      state: "known",
      fraction: 0.75,
      source: expect.stringContaining(newest),
    });
  });
  it("reports unknown for no source, no allowance, expired windows, and invalid percentages", async () => {
    const root = directory();
    expect(await readCodexHeadroom(join(root, "missing"), 1000)).toMatchObject({
      state: "unknown",
      reason: expect.stringContaining("missing"),
    });
    const path = join(root, "rollout-fixture.jsonl");
    for (const primary of [
      {},
      { used_percent: 20, resets_at: 0 },
      { used_percent: 101, resets_at: 2000 },
    ]) {
      writeFileSync(path, `${event(primary)}\n`);
      expect(await readCodexHeadroom(root, 1000)).toMatchObject({
        state: "unknown",
        reason: expect.stringContaining(path),
      });
    }
    expect(readClaudeHeadroom()).toMatchObject({
      state: "unknown",
      reason: expect.stringContaining("allowance"),
    });
    expect(readKimiHeadroom()).toMatchObject({
      state: "unknown",
      reason: expect.stringContaining("allowance"),
    });
  });
});

describe("local routing configuration", () => {
  it.each(["local@v0", "local@v1"])(
    "reads %s without rewriting and retains optional routing order",
    async (tag) => {
      const root = directory();
      mkdirSync(join(root, ".interlock"));
      const path = join(root, ".interlock", "local.yaml");
      const yaml = `interlock: ${tag}\nruntime:\n  kind: fake\nworktree_root: .worktrees\nlease_ms: 100\nrun_timeout_ms: 100\nsubstrate:\n  address: none\nprovider_order: [b, a]\nlast_resort: a\n`;
      writeFileSync(path, yaml);
      const result = await loadLocalConfig(root);
      if (isErr(result)) throw new Error(result.error.kind);
      expect(result.value).toMatchObject({ providerOrder: ["b", "a"], lastResort: "a" });
      expect(readFileSync(path, "utf-8")).toBe(yaml);
    },
  );
});

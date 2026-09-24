import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isErr, isOk } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import type { LocalConfig } from "../src/localConfig.ts";
import {
  explainMergeRuntimesRefusal,
  explainRuntimeCatalogueRefusal,
  loadRuntimeCatalogue,
  mergeRuntimes,
  runtimeCataloguePath,
} from "../src/runtimeCatalogue.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function fixtureFile(contents: string): string {
  directory = mkdtempSync(join(runsRoot, "runtimes-"));
  const path = join(directory, "runtimes.yaml");
  writeFileSync(path, contents);
  return path;
}

function localConfigWith(overrides: Partial<LocalConfig> = {}): LocalConfig {
  return {
    runtime: {
      kind: "claude",
      args: [],
      startupAnswers: [],
      startupTimeoutMs: 60_000,
      promptTakenTimeoutMs: 20_000,
      readySettleMs: 0,
      promptRetries: 2,
    },
    worktreeRoot: ".worktrees",
    worktreeSetup: [],
    leaseMs: 900_000,
    runTimeoutMs: 3_600_000,
    answerGraceMs: 300_000,
    substrateAddress: "none",
    substrateSendRepository: false,
    ...overrides,
  };
}

describe("loadRuntimeCatalogue: absent file", () => {
  it("is an empty catalogue, never an error", async () => {
    directory = mkdtempSync(join(runsRoot, "runtimes-"));
    const path = join(directory, "does-not-exist.yaml");

    const result = await loadRuntimeCatalogue(path);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value.size).toBe(0);
  });
});

describe("loadRuntimeCatalogue: a present but unreadable file", () => {
  it("refuses with a sentence naming the path and the error code, rather than an uncaught stack trace", async () => {
    directory = mkdtempSync(join(runsRoot, "runtimes-"));
    // A directory where a file is expected reads as EISDIR on readFile, never ENOENT.
    const path = join(directory, "runtimes.yaml");
    mkdirSync(path);

    const result = await loadRuntimeCatalogue(path);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toEqual({
        kind: "unreadable",
        path,
        code: "EISDIR",
      });
      const message = explainRuntimeCatalogueRefusal(result.error);
      expect(message).toContain(path);
      expect(message).toContain("EISDIR");
    }
  });
});

describe("loadRuntimeCatalogue: a valid catalogue", () => {
  it("parses named entries with their declared fields", async () => {
    const path = fixtureFile(
      [
        "interlock: runtimes@v0",
        "runtimes:",
        "  fast:",
        "    kind: claude",
        "    args: [--flag]",
        "    model: fast-model-label",
        "  careful:",
        "    kind: codex",
        "    model: careful-model-label",
        "    startup_timeout_ms: 15000",
        "",
      ].join("\n"),
    );

    const result = await loadRuntimeCatalogue(path);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.get("fast")).toEqual({
        kind: "claude",
        args: ["--flag"],
        model: "fast-model-label",
        startupAnswers: [],
        startupTimeoutMs: 60_000,
        promptTakenTimeoutMs: 20_000,
        readySettleMs: 0,
        promptRetries: 2,
      });
      expect(result.value.get("careful")).toEqual({
        kind: "codex",
        args: [],
        model: "careful-model-label",
        startupAnswers: [],
        startupTimeoutMs: 15_000,
        promptTakenTimeoutMs: 20_000,
        readySettleMs: 0,
        promptRetries: 2,
      });
    }
  });

  it("defaults to an empty catalogue when runtimes: is absent", async () => {
    const path = fixtureFile(["interlock: runtimes@v0", ""].join("\n"));

    const result = await loadRuntimeCatalogue(path);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value.size).toBe(0);
  });

  it("parses prompt_taken_timeout_ms, additive over the required fields", async () => {
    const path = fixtureFile(
      [
        "interlock: runtimes@v0",
        "runtimes:",
        "  fast:",
        "    kind: claude",
        "    model: fast-model-label",
        "    prompt_taken_timeout_ms: 5000",
        "",
      ].join("\n"),
    );

    const result = await loadRuntimeCatalogue(path);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.get("fast")).toMatchObject({
        promptTakenTimeoutMs: 5_000,
      });
    }
  });

  it("parses ready_settle_ms and prompt_retries, both additive over the required fields", async () => {
    const path = fixtureFile(
      [
        "interlock: runtimes@v0",
        "runtimes:",
        "  fast:",
        "    kind: claude",
        "    model: fast-model-label",
        "    ready_settle_ms: 4000",
        "    prompt_retries: 5",
        "",
      ].join("\n"),
    );

    const result = await loadRuntimeCatalogue(path);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.get("fast")).toMatchObject({
        readySettleMs: 4_000,
        promptRetries: 5,
      });
    }
  });

  it("parses startup_answers reusing the shared validation", async () => {
    const path = fixtureFile(
      [
        "interlock: runtimes@v0",
        "runtimes:",
        "  fast:",
        "    kind: claude",
        "    model: fast-model-label",
        "    startup_answers:",
        '      - matches: "trust this project"',
        "        keys: [Down, Enter]",
        "",
      ].join("\n"),
    );

    const result = await loadRuntimeCatalogue(path);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.get("fast")?.startupAnswers).toEqual([
        { matches: "trust this project", keys: ["Down", "Enter"] },
      ]);
    }
  });
});

describe("loadRuntimeCatalogue: a malformed catalogue refuses with a sentence", () => {
  it.each([
    [
      "wrong shape tag",
      ["interlock: runtimes@v9", "runtimes: {}", ""].join("\n"),
      'shape tag is "runtimes@v9"',
    ],
    [
      "an entry that is not a mapping",
      ["interlock: runtimes@v0", "runtimes:", "  fast: not-a-mapping", ""].join("\n"),
      '"runtimes.fast" is not a mapping',
    ],
    [
      "an entry missing kind",
      ["interlock: runtimes@v0", "runtimes:", "  fast:", "    model: m", ""].join("\n"),
      '"runtimes.fast.kind" is missing or not a string',
    ],
    [
      "an entry missing model",
      ["interlock: runtimes@v0", "runtimes:", "  fast:", "    kind: claude", ""].join("\n"),
      '"runtimes.fast.model" is missing or not a string',
    ],
    [
      "an entry with an unknown key",
      [
        "interlock: runtimes@v0",
        "runtimes:",
        "  fast:",
        "    kind: claude",
        "    model: m",
        "    vendor_flag: true",
        "",
      ].join("\n"),
      '"runtimes.fast" has an unknown key "vendor_flag"',
    ],
    [
      "a non-positive startup_timeout_ms",
      [
        "interlock: runtimes@v0",
        "runtimes:",
        "  fast:",
        "    kind: claude",
        "    model: m",
        "    startup_timeout_ms: 0",
        "",
      ].join("\n"),
      '"runtimes.fast.startup_timeout_ms" must be a positive integer',
    ],
    [
      "a non-positive prompt_taken_timeout_ms",
      [
        "interlock: runtimes@v0",
        "runtimes:",
        "  fast:",
        "    kind: claude",
        "    model: m",
        "    prompt_taken_timeout_ms: 0",
        "",
      ].join("\n"),
      '"runtimes.fast.prompt_taken_timeout_ms" must be a positive integer',
    ],
    [
      "a negative ready_settle_ms",
      [
        "interlock: runtimes@v0",
        "runtimes:",
        "  fast:",
        "    kind: claude",
        "    model: m",
        "    ready_settle_ms: -1",
        "",
      ].join("\n"),
      '"runtimes.fast.ready_settle_ms" must be a non-negative integer',
    ],
    [
      "a non-integer prompt_retries",
      [
        "interlock: runtimes@v0",
        "runtimes:",
        "  fast:",
        "    kind: claude",
        "    model: m",
        "    prompt_retries: 1.5",
        "",
      ].join("\n"),
      '"runtimes.fast.prompt_retries" must be a non-negative integer',
    ],
    [
      "a name that is not a compliant agent name",
      [
        "interlock: runtimes@v0",
        "runtimes:",
        "  Fast:",
        "    kind: claude",
        "    model: m",
        "",
      ].join("\n"),
      '"runtimes.Fast" is not a valid runtime name',
    ],
  ])("refuses %s", async (_name, contents, reasonFragment) => {
    const path = fixtureFile(contents);

    const result = await loadRuntimeCatalogue(path);

    expect(isErr(result)).toBe(true);
    if (isErr(result) && result.error.kind === "malformed") {
      expect(result.error.reason).toContain(reasonFragment);
      expect(explainRuntimeCatalogueRefusal(result.error)).toContain(path);
    }
  });

  it("refuses invalid YAML with a sentence naming the path", async () => {
    const path = fixtureFile("interlock: runtimes@v0\nruntimes: [unterminated");

    const result = await loadRuntimeCatalogue(path);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(explainRuntimeCatalogueRefusal(result.error)).toContain(path);
  });
});

describe("runtimeCataloguePath", () => {
  const savedEnv = {
    INTERLOCK_RUNTIMES: process.env["INTERLOCK_RUNTIMES"],
    XDG_CONFIG_HOME: process.env["XDG_CONFIG_HOME"],
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("prefers INTERLOCK_RUNTIMES when set", () => {
    process.env["INTERLOCK_RUNTIMES"] = "/tmp/wherever/runtimes.yaml";
    process.env["XDG_CONFIG_HOME"] = "/tmp/xdg";

    expect(runtimeCataloguePath()).toBe("/tmp/wherever/runtimes.yaml");
  });

  it("falls back to $XDG_CONFIG_HOME/interlock/runtimes.yaml", () => {
    delete process.env["INTERLOCK_RUNTIMES"];
    process.env["XDG_CONFIG_HOME"] = "/tmp/xdg";

    expect(runtimeCataloguePath()).toBe(join("/tmp/xdg", "interlock", "runtimes.yaml"));
  });
});

describe("mergeRuntimes", () => {
  it("merges catalogue entries with the legacy default from local.yaml", () => {
    const catalogue = new Map([
      [
        "fast",
        {
          kind: "claude",
          args: [],
          model: "fast-model-label",
          startupAnswers: [],
          startupTimeoutMs: 60_000,
          promptTakenTimeoutMs: 9_000,
          readySettleMs: 2_000,
          promptRetries: 4,
        },
      ],
    ]);
    const local = localConfigWith({
      runtime: {
        ...localConfigWith().runtime,
        kind: "codex",
        promptTakenTimeoutMs: 20_000,
        readySettleMs: 1_000,
        promptRetries: 3,
      },
    });

    const merged = mergeRuntimes(catalogue, local);

    expect(isOk(merged)).toBe(true);
    if (isOk(merged)) {
      expect([...merged.value.runtimes.keys()]).toEqual(["fast", "default"]);
      expect(merged.value.runtimes.get("default")).toMatchObject({
        kind: "codex",
        model: undefined,
        promptTakenTimeoutMs: 20_000,
        readySettleMs: 1_000,
        promptRetries: 3,
        source: "local.yaml",
      });
      expect(merged.value.runtimes.get("fast")).toMatchObject({
        promptTakenTimeoutMs: 9_000,
        readySettleMs: 2_000,
        promptRetries: 4,
        source: "catalogue",
      });
    }
  });

  it("is an empty view when there is no catalogue and no local.yaml", () => {
    const merged = mergeRuntimes(new Map(), undefined);

    expect(isOk(merged)).toBe(true);
    if (isOk(merged)) {
      expect(merged.value.runtimes.size).toBe(0);
      expect(merged.value.defaultRuntime).toBeUndefined();
    }
  });

  it("refuses when the catalogue also declares a runtime named default", () => {
    const catalogue = new Map([
      [
        "default",
        {
          kind: "claude",
          args: [],
          model: "m",
          startupAnswers: [],
          startupTimeoutMs: 60_000,
          promptTakenTimeoutMs: 20_000,
          readySettleMs: 0,
          promptRetries: 2,
        },
      ],
    ]);

    const merged = mergeRuntimes(catalogue, localConfigWith());

    expect(isErr(merged)).toBe(true);
    if (isErr(merged)) {
      expect(merged.error).toEqual({ kind: "duplicate-default" });
      expect(explainMergeRuntimesRefusal(merged.error)).toContain("default");
    }
  });

  it("refuses when default_runtime names a runtime the merged view does not know", () => {
    const local = localConfigWith({ defaultRuntime: "nope" });

    const merged = mergeRuntimes(new Map(), local);

    expect(isErr(merged)).toBe(true);
    if (isErr(merged)) {
      expect(merged.error).toEqual({
        kind: "unknown-default-runtime",
        name: "nope",
        known: ["default"],
      });
      expect(explainMergeRuntimesRefusal(merged.error)).toContain("nope");
    }
  });

  it("accepts default_runtime naming a known catalogue entry", () => {
    const catalogue = new Map([
      [
        "fast",
        {
          kind: "claude",
          args: [],
          model: "m",
          startupAnswers: [],
          startupTimeoutMs: 60_000,
          promptTakenTimeoutMs: 20_000,
          readySettleMs: 0,
          promptRetries: 2,
        },
      ],
    ]);
    const local = localConfigWith({ defaultRuntime: "fast" });

    const merged = mergeRuntimes(catalogue, local);

    expect(isOk(merged)).toBe(true);
    if (isOk(merged)) expect(merged.value.defaultRuntime).toBe("fast");
  });
});

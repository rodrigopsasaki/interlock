import { execFile, spawn } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { buildRegistry, validatorFor } from "../packages/schemas/src/registry.ts";

const checkout = resolve(import.meta.dirname, "..");
const bin = resolve(checkout, "packages", "cli", "src", "bin.ts");
const runs = 4;
const budgetMs = 1000;
const run = promisify(execFile);

interface Invocation {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly ms: number;
}

type JsonObject = { readonly [key: string]: unknown };

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && Array.isArray(value) === false;
}

function listAt(value: JsonObject, key: string): readonly unknown[] {
  const list = value[key];
  if (Array.isArray(list) === false) throw new Error(`expected ${key} to be a list`);
  return list;
}

function envNames(args: readonly string[]): readonly string[] {
  const usage = "usage: node scripts/warmPosition.ts --repo-env NAME --repo-env NAME";
  if (args.length !== 4) throw new Error(usage);
  return [0, 2].map((index) => {
    const name = args[index + 1];
    if (args[index] !== "--repo-env" || name === undefined || name === "") {
      throw new Error(usage);
    }
    return name;
  });
}

async function repositoryRoot(name: string): Promise<string> {
  const path = process.env[name];
  if (path === undefined || path === "") throw new Error(`${name} is unset or empty`);
  const real = await realpath(path).catch(() => {
    throw new Error(`${name}=${path} does not exist`);
  });
  if ((await stat(real)).isDirectory() === false) {
    throw new Error(`${name}=${path} is not a directory`);
  }
  const toplevel = await run("git", ["-C", real, "rev-parse", "--show-toplevel"]).catch(() => {
    throw new Error(`${name}=${path} is not a git repository`);
  });
  if ((await realpath(toplevel.stdout.trim())) !== real) {
    throw new Error(`${name}=${path} is not a repository root`);
  }
  const interlock = await stat(join(real, ".interlock")).catch(() => undefined);
  if (interlock?.isDirectory() !== true) {
    throw new Error(`${name}=${path} has no .interlock directory`);
  }
  return real;
}

function invoke(roots: readonly string[]): Promise<Invocation> {
  const args = [bin, "position", "--json", ...roots.flatMap((root) => ["--repo", root])];
  return new Promise((settle, fail) => {
    const started = performance.now();
    const child = spawn(process.execPath, args, { cwd: checkout });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", fail);
    child.on("close", (code) =>
      settle({
        code,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        ms: performance.now() - started,
      }),
    );
  });
}

function clearedNodes(graph: JsonObject): number {
  const position = graph["position"];
  if (isObject(position) === false)
    throw new Error(`graph ${String(graph["graph"])} has no position`);
  return listAt(position, "nodes").filter((node) => {
    const state = isObject(node) ? node["state"] : undefined;
    const outcome = isObject(state) && state["kind"] === "outcome" ? state["outcome"] : undefined;
    return isObject(outcome) && outcome["kind"] === "cleared";
  }).length;
}

async function counted(
  invocation: Invocation,
  roots: readonly string[],
  validate: (value: unknown) => boolean,
): Promise<readonly string[]> {
  if (invocation.code !== 0) {
    throw new Error(`position exited ${String(invocation.code)}: ${invocation.stderr.trim()}`);
  }
  const positions: unknown = JSON.parse(invocation.stdout);
  if (validate(positions) === false || isObject(positions) === false) {
    throw new Error("output is not valid positions@v0 JSON");
  }
  const repositories = listAt(positions, "repositories");
  if (repositories.length !== roots.length) {
    throw new Error(
      `expected ${String(roots.length)} repositories, got ${String(repositories.length)}`,
    );
  }
  const lines: string[] = [];
  for (const [index, repository] of repositories.entries()) {
    const asked = roots[index];
    if (isObject(repository) === false || repository["state"] !== "found") {
      throw new Error(`repository ${String(asked)} was not found`);
    }
    const root = repository["root"];
    if (typeof root !== "string" || (await realpath(root)) !== asked) {
      throw new Error(
        `repository ${String(index + 1)} reads ${String(root)}, asked ${String(asked)}`,
      );
    }
    const journal = repository["journal"];
    if (isObject(journal) === false || journal["state"] !== "read") {
      throw new Error(`${root}: journal unreadable`);
    }
    const graphs = listAt(repository, "graphs").map((graph) => {
      if (isObject(graph) === false || graph["state"] !== "read") {
        throw new Error(
          `${root}: graph ${isObject(graph) ? String(graph["graph"]) : "?"} unreadable`,
        );
      }
      return graph;
    });
    const cleared = graphs.reduce((sum, graph) => sum + clearedNodes(graph), 0);
    lines.push(`${root}: ${String(graphs.length)} graphs, ${String(cleared)} cleared nodes`);
  }
  return lines;
}

async function main(): Promise<number> {
  const names = envNames(process.argv.slice(2));
  const roots: string[] = [];
  for (const name of names) roots.push(await repositoryRoot(name));
  if (new Set(roots).size !== roots.length) throw new Error("both paths name the same repository");
  const validator = validatorFor(buildRegistry(), "positions@v0");
  if (validator === undefined) throw new Error("positions@v0 schema not found");
  const validate = (value: unknown): boolean => validator(value) === true;

  const measured: number[] = [];
  for (let index = 1; index <= runs; index += 1) {
    const invocation = await invoke(roots);
    const lines = await counted(invocation, roots, validate);
    const ms = Math.round(invocation.ms);
    if (index === 1) console.log(`run 1 (warm-up): ${String(ms)} ms`);
    else {
      measured.push(invocation.ms);
      console.log(`run ${String(index)}: ${String(ms)} ms`);
    }
    if (index === runs) for (const line of lines) console.log(line);
  }
  const slowest = Math.round(Math.max(...measured));
  console.log(`warm position ms: ${String(slowest)}`);
  if (Math.max(...measured) >= budgetMs) {
    console.error(`slowest warm read ${String(slowest)} ms is not under ${String(budgetMs)} ms`);
    return 1;
  }
  console.log("warm position: ok");
  return 0;
}

process.exitCode = await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  return 1;
});

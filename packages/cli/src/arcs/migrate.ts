import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import { isMap, isScalar, isSeq, parseDocument, YAMLSeq, type YAMLMap } from "yaml";
import { gitOrigin, repositoryForOrigin } from "../repositoryOrigin.ts";
import {
  ARCS_V0,
  ARCS_V1,
  parseArcsRegistry,
} from "./reader.ts";

interface Listing {
  readonly arc: YAMLMap;
  readonly arcId: string;
  readonly graph: string;
  readonly normalized: string;
  readonly index: number;
  readonly note?: string;
}

interface MigrationResult {
  readonly changed: boolean;
  readonly repository?: string;
}

function scalarString(value: unknown): string | undefined {
  return isScalar(value) && typeof value.value === "string" ? value.value : undefined;
}

function mapString(map: YAMLMap, key: string): string | undefined {
  return scalarString(map.get(key, true));
}

function normalizedGraph(graph: string): string {
  return graph.replace(/\s+\([^()]*\)$/, "");
}

function sharedNote(graph: string): { readonly normalized: string; readonly note: string; readonly other: string } | undefined {
  const match = /^(.*)\s+\(shared with ([a-z0-9]+(?:-[a-z0-9]+)*)\)$/.exec(graph);
  if (match === null) return undefined;
  const normalized = match[1];
  const other = match[2];
  if (normalized === undefined || other === undefined || normalized.length === 0) return undefined;
  return { normalized, note: `shared with ${other}`, other };
}

function rootMap(document: ReturnType<typeof parseDocument>): YAMLMap | undefined {
  return document.contents !== null && isMap(document.contents) ? document.contents : undefined;
}

function arcMaps(root: YAMLMap): readonly YAMLMap[] {
  const value = root.get("arcs", true);
  if (!isSeq(value)) return [];
  return value.items.filter((item): item is YAMLMap => isMap(item));
}

function listingsFor(root: YAMLMap): readonly Listing[] {
  const result: Listing[] = [];
  for (const arc of arcMaps(root)) {
    const arcId = mapString(arc, "id");
    const graphs = arc.get("graphs", true);
    if (arcId === undefined || !isSeq(graphs)) continue;
    const seen = new Set<string>();
    for (let index = 0; index < graphs.items.length; index += 1) {
      const graph = scalarString(graphs.items[index]);
      if (graph === undefined) continue;
      const normalized = normalizedGraph(graph);
      if (seen.has(normalized)) {
        graphs.items.splice(index, 1);
        index -= 1;
        continue;
      }
      seen.add(normalized);
      const note = sharedNote(graph);
      result.push({
        arc,
        arcId,
        graph,
        normalized,
        index,
        ...(note === undefined ? {} : { note: note.note }),
      });
    }
  }
  return result;
}

function addContext(document: ReturnType<typeof parseDocument>, arc: YAMLMap, graph: string, because: string): void {
  const current = arc.get("context", true);
  const context = isSeq(current) ? current : new YAMLSeq();
  context.add(document.createNode({ graph, because }));
  if (!isSeq(current)) arc.set("context", context);
}

function removeGraph(arc: YAMLMap, graph: string): void {
  const graphs = arc.get("graphs", true);
  if (!isSeq(graphs)) return;
  for (let index = graphs.items.length - 1; index >= 0; index -= 1) {
    if (scalarString(graphs.items[index]) === graph) graphs.items.splice(index, 1);
  }
}

function addRepository(root: YAMLMap, document: ReturnType<typeof parseDocument>, repository: string): void {
  const tag = root.get("interlock", true);
  if (isScalar(tag)) tag.value = ARCS_V1;
  else root.set("interlock", ARCS_V1);

  if (root.has("repository")) {
    root.set("repository", repository);
    return;
  }
  const tagIndex = root.items.findIndex((pair) => scalarString(pair.key) === "interlock");
  const pair = document.createPair("repository", repository);
  root.items.splice(tagIndex < 0 ? 0 : tagIndex + 1, 0, pair);
}

async function repositoryForMigration(repoRoot: string, override: string | undefined): Promise<Result<string, string>> {
  if (override !== undefined) return ok(override);
  const origin = await gitOrigin(repoRoot);
  if (isErr(origin)) return err("repository identity is unavailable; run interlock arcs migrate --repository <name>");
  const identity = repositoryForOrigin(origin.value);
  return isErr(identity)
    ? err("repository identity is unavailable; run interlock arcs migrate --repository <name>")
    : ok(identity.value.name);
}

export async function migrateArcs(
  repoRoot: string,
  repositoryOverride?: string,
): Promise<Result<MigrationResult, string>> {
  const path = join(repoRoot, ".interlock", "arcs.yaml");
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return err(`${path}: no such file; expected an arcs@v0 or arcs@v1 document.`);
    }
    throw error;
  }

  const document = parseDocument(raw);
  const root = rootMap(document);
  if (root === undefined) return err(`${path}: the document is not a YAML mapping`);
  const tag = mapString(root, "interlock");
  if (tag === ARCS_V1) return ok({ changed: false });
  if (tag !== ARCS_V0) return err(`${path}: expected ${ARCS_V0} or ${ARCS_V1}`);

  const parsedShape = parseArcsRegistry(document.toJS(), repositoryOverride ?? "migration");
  if (isErr(parsedShape)) return err(`${path}: ${parsedShape.error}`);
  if (parsedShape.value.needsHisWords.length > 0) {
    const graphs = parsedShape.value.needsHisWords.map((entry) => entry.graph).join(", ");
    return err(`${path}: cannot migrate non-empty needs_his_words; edit arcs.yaml to choose an arc for ${graphs}`);
  }
  const repository = await repositoryForMigration(repoRoot, repositoryOverride);
  if (isErr(repository)) return repository;
  const parsed = parseArcsRegistry(document.toJS(), repository.value);
  if (isErr(parsed)) return err(`${path}: ${parsed.error}`);

  const listings = listingsFor(root);
  const byGraph = new Map<string, Listing[]>();
  for (const listing of listings) {
    const group = byGraph.get(listing.normalized) ?? [];
    group.push(listing);
    byGraph.set(listing.normalized, group);
  }
  for (const group of byGraph.values()) {
    const owners = [...new Set(group.map((listing) => listing.arcId))];
    if (owners.length < 2) continue;
    if (owners.length !== 2 || group.length !== 2) {
      return err(`${path}: graph ${group[0]?.normalized ?? "unknown"} is listed under arcs ${owners.join(" and ")}; edit arcs.yaml to choose an owner`);
    }
    const noted = group.find((listing) => listing.note !== undefined);
    const plain = group.find((listing) => listing.note === undefined);
    if (noted === undefined || plain === undefined || noted.note !== `shared with ${plain.arcId}`) {
      return err(`${path}: graph ${group[0]?.normalized ?? "unknown"} is listed under arcs ${owners.join(" and ")}; edit arcs.yaml to choose an owner`);
    }
    addContext(document, noted.arc, noted.normalized, noted.note);
    removeGraph(noted.arc, noted.graph);
  }

  addRepository(root, document, repository.value);
  root.delete("needs_his_words");
  await writeFile(path, document.toString(), "utf-8");
  return ok({ changed: true, repository: repository.value });
}

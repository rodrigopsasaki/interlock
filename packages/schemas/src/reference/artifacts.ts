import { readdirSync } from "node:fs";
import { join } from "node:path";
import { isString, prop } from "./json.ts";
import { loadSchemaFiles, type SchemaFiles } from "./schemaFiles.ts";

export interface ArtifactVersion {
  readonly tag: string;
  readonly version: number;
  readonly filePath: string;
  readonly schema: Record<string, unknown>;
}

export interface Artifact {
  readonly term: string;
  readonly versions: readonly ArtifactVersion[];
}

const TAG = /^([a-z]+)@v(\d+)$/;

export function loadArtifacts(schemasDirectory: string): {
  readonly artifacts: readonly Artifact[];
  readonly files: SchemaFiles;
} {
  const files = loadSchemaFiles(schemasDirectory);
  const byTerm = new Map<string, ArtifactVersion[]>();

  const topLevelEntries = readdirSync(schemasDirectory, {
    withFileTypes: true,
  }).filter((entry) => entry.isFile() && entry.name.endsWith(".json"));

  for (const entry of topLevelEntries) {
    const filePath = join(schemasDirectory, entry.name);
    const schema = files.byPath.get(filePath);
    if (schema === undefined) continue;

    const title = prop(schema, "title");
    if (!isString(title)) continue;

    const match = TAG.exec(title);
    if (match === null) continue;
    const [, term, versionText] = match;
    if (term === undefined || versionText === undefined) continue;

    const version: ArtifactVersion = {
      tag: title,
      version: Number(versionText),
      filePath,
      schema,
    };
    const versions = byTerm.get(term) ?? [];
    versions.push(version);
    byTerm.set(term, versions);
  }

  const artifacts = [...byTerm.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([term, versions]) => ({
      term,
      versions: versions.toSorted((a, b) => a.version - b.version),
    }));

  return { artifacts, files };
}

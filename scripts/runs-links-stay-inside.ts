import { type Dirent, lstatSync, readdirSync, readlinkSync, type Stats } from "node:fs";
import { dirname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface EscapingLink {
  readonly path: string;
  readonly target: string;
}

interface ScanFailure {
  readonly reason: string;
}

interface ScanResult {
  readonly links: readonly EscapingLink[];
  readonly failure?: ScanFailure;
}

function inside(root: string, path: string): boolean {
  const remainder = relative(root, path);
  return remainder === "" || (!remainder.startsWith("..") && !isAbsolute(remainder));
}

function stat(path: string): Stats | ScanFailure {
  try {
    return lstatSync(path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { reason: `unreadable entry ${path}: ${message}` };
  }
}

function targetForLink(linkPath: string, target: string): string {
  return normalize(isAbsolute(target) ? target : join(dirname(linkPath), target));
}

function resolveLink(root: string, linkPath: string): EscapingLink | undefined {
  let current = linkPath;
  const seen = new Set<string>();
  for (;;) {
    if (seen.has(current)) return undefined;
    seen.add(current);
    const entry = stat(current);
    if ("reason" in entry) {
      if (entry.reason.startsWith("unreadable entry") && entry.reason.includes("ENOENT")) {
        return inside(root, current) ? undefined : { path: linkPath, target: current };
      }
      return { path: linkPath, target: entry.reason };
    }
    if (!entry.isSymbolicLink()) return undefined;
    let target: string;
    try {
      target = readlinkSync(current);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { path: linkPath, target: `unreadable link ${current}: ${message}` };
    }
    const resolved = targetForLink(current, target);
    if (!inside(root, resolved)) return { path: linkPath, target: resolved };
    current = resolved;
  }
}

function scanDirectory(
  root: string,
  directory: string,
  links: EscapingLink[],
): ScanFailure | undefined {
  let entries: readonly Dirent[];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { reason: `unreadable directory ${directory}: ${message}` };
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const result = stat(path);
    if ("reason" in result) return result;
    if (result.isSymbolicLink()) {
      const escaping = resolveLink(root, path);
      if (escaping !== undefined) links.push(escaping);
      continue;
    }
    if (result.isDirectory()) {
      const failure = scanDirectory(root, path, links);
      if (failure !== undefined) return failure;
    }
  }
  return undefined;
}

export function scanRepositoryLinks(rootInput: string): ScanResult {
  const root = resolve(rootInput);
  const entry = stat(root);
  if ("reason" in entry) return { links: [], failure: entry };
  if (!entry.isDirectory())
    return { links: [], failure: { reason: `root is not a directory: ${root}` } };
  const links: EscapingLink[] = [];
  const failure = scanDirectory(root, root, links);
  return failure === undefined ? { links } : { links, failure };
}

function main(): number {
  const printedRoot = process.argv[2] ?? process.cwd();
  console.log(`scan root: ${printedRoot}`);
  const result = scanRepositoryLinks(printedRoot);
  if (result.failure !== undefined) {
    console.error(`scan incomplete: ${result.failure.reason}`);
    return 2;
  }
  for (const link of result.links) console.error(`${link.path} -> ${link.target}`);
  if (result.links.length > 0) return 1;
  console.log("no symlink leaves the repository");
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main();

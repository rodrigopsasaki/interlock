import type { Dirent } from "node:fs";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = resolve(import.meta.dirname, "..");

const biomeIgnoreWithReason = /^\/\/\s*biome-ignore\b[^:]*:\s*\S/;

export interface CommentViolation {
  readonly relativePath: string;
  readonly line: number;
}

function collectCommentRanges(sourceFile: ts.SourceFile): readonly ts.CommentRange[] {
  const sourceText = sourceFile.text;
  const byStart = new Map<number, ts.CommentRange>();

  const collectAt = (pos: number): void => {
    for (const range of ts.getLeadingCommentRanges(sourceText, pos) ?? [])
      byStart.set(range.pos, range);
    for (const range of ts.getTrailingCommentRanges(sourceText, pos) ?? [])
      byStart.set(range.pos, range);
  };

  const visit = (node: ts.Node): void => {
    collectAt(node.getFullStart());
    for (const child of node.getChildren(sourceFile)) visit(child);
  };
  visit(sourceFile);

  return Array.from(byStart.values()).sort((a, b) => a.pos - b.pos);
}

export function findCommentViolations(sourceText: string): readonly number[] {
  const sourceFile = ts.createSourceFile(
    "source.ts",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const lines = new Set<number>();

  for (const range of collectCommentRanges(sourceFile)) {
    const text = sourceText.slice(range.pos, range.end);
    if (range.kind === ts.SyntaxKind.SingleLineCommentTrivia && biomeIgnoreWithReason.test(text)) {
      continue;
    }

    const startLine = ts.getLineAndCharacterOfPosition(sourceFile, range.pos).line;
    const endLine = ts.getLineAndCharacterOfPosition(sourceFile, range.end - 1).line;
    for (let line = startLine; line <= endLine; line += 1) lines.add(line + 1);
  }

  return Array.from(lines).sort((a, b) => a - b);
}

function listTypeScriptFiles(srcDir: string): readonly string[] {
  let entries: readonly Dirent[];
  try {
    entries = readdirSync(srcDir, { recursive: true, withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => join(entry.parentPath, entry.name));
}

function findPackageSourceFiles(packagesRoot: string): readonly string[] {
  let packageNames: readonly string[];
  try {
    packageNames = readdirSync(packagesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }

  return packageNames.flatMap((packageName) =>
    listTypeScriptFiles(join(packagesRoot, packageName, "src")),
  );
}

export function scanRepository(root: string): readonly CommentViolation[] {
  const violations: CommentViolation[] = [];
  for (const filePath of findPackageSourceFiles(join(root, "packages"))) {
    const sourceText = readFileSync(filePath, "utf-8");
    for (const line of findCommentViolations(sourceText)) {
      violations.push({ relativePath: relative(root, filePath), line });
    }
  }
  return violations;
}

function main(): number {
  const violations = scanRepository(repoRoot);
  if (violations.length === 0) {
    console.log("packages/*/src: no comments found.");
    return 0;
  }

  for (const violation of violations) {
    console.error(`${violation.relativePath}:${String(violation.line)}`);
  }
  console.error(
    `${String(violations.length)} comment line(s) in packages/*/src; only a biome-ignore line with a reason may remain.`,
  );
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}

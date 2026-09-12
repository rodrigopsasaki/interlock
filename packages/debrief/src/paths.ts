import { join } from "node:path";

export function sessionDirectory(repoRoot: string, graph: string, node: string): string {
  return join(repoRoot, ".interlock", "sessions", graph, node);
}

export function debriefFilePath(repoRoot: string, graph: string, node: string): string {
  return join(sessionDirectory(repoRoot, graph, node), "debrief.yaml");
}

export function notesFilePath(repoRoot: string, graph: string, node: string): string {
  return join(sessionDirectory(repoRoot, graph, node), "notes.yaml");
}

export function briefFilePath(repoRoot: string, graph: string, node: string): string {
  return join(sessionDirectory(repoRoot, graph, node), "brief.md");
}

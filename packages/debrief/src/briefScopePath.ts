import { isAbsolute, normalize } from "node:path/posix";

// A scope path is declared repository-relative. Absolute paths and paths that climb above the
// root with a leading ".." are both refused; everything else is a path the root can resolve.
export function isValidScopePath(path: string): boolean {
  if (isAbsolute(path)) return false;
  const normalized = normalize(path);
  return normalized !== ".." && !normalized.startsWith("../");
}

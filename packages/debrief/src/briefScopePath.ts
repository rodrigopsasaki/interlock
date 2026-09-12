import { isAbsolute, normalize } from "node:path/posix";

export function isValidScopePath(path: string): boolean {
  if (isAbsolute(path)) return false;
  const normalized = normalize(path);
  return normalized !== ".." && !normalized.startsWith("../");
}

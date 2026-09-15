import { isAbsolute } from "node:path/posix";
import { isRecord, isString, prop } from "./validate.ts";

export type AppliesTo =
  | { readonly kind: "repository" }
  | { readonly kind: "path"; readonly path: string };

export function isSafeAppliesToPath(path: string): boolean {
  if (path.length === 0 || path.trim() !== path || isAbsolute(path)) return false;
  if (path.includes("\0") || path.includes(":") || path.includes("\\")) return false;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export function isAppliesTo(value: unknown): value is AppliesTo {
  if (!isRecord(value)) return false;
  const kind = prop(value, "kind");
  if (kind === "repository") return Object.keys(value).length === 1;
  if (kind !== "path") return false;
  const path = prop(value, "path");
  return isString(path) && isSafeAppliesToPath(path) && Object.keys(value).length === 2;
}

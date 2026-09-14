import { execFile } from "node:child_process";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import {
  type Repository,
  refusalClient,
  type SubstrateClient,
  substrateClientFor,
} from "substrate";

const ORIGIN_REFUSAL = "repository origin could not establish an unambiguous repository identity";

function pathIdentity(
  path: string,
): Result<{ readonly owner: string; readonly name: string }, string> {
  const parts = path.split("/").filter((part) => part.length > 0);
  if (parts.length !== 2) return err(ORIGIN_REFUSAL);
  const owner = parts[0];
  const nameWithSuffix = parts[1];
  if (owner === undefined || nameWithSuffix === undefined) return err(ORIGIN_REFUSAL);
  const name = nameWithSuffix.endsWith(".git") ? nameWithSuffix.slice(0, -4) : nameWithSuffix;
  if (owner.length === 0 || name.length === 0) return err(ORIGIN_REFUSAL);
  return ok({ owner, name });
}

export function repositoryForOrigin(origin: string): Result<Repository, string> {
  const trimmed = origin.trim();
  const scp = trimmed.includes("://") ? null : /^(?:[^@/:]+@)?([^:/]+):(.+)$/.exec(trimmed);
  if (scp !== null) {
    const host = scp[1];
    const path = scp[2];
    if (host === undefined || path === undefined) return err(ORIGIN_REFUSAL);
    if (path.includes("?") || path.includes("#")) return err(ORIGIN_REFUSAL);
    const identity = pathIdentity(path);
    if (isErr(identity)) return identity;
    return ok({
      ...identity.value,
      originUrl: `ssh://${host}/${path}`,
    });
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return err(ORIGIN_REFUSAL);
  }
  if ((url.protocol !== "https:" && url.protocol !== "ssh:") || url.hostname.length === 0) {
    return err(ORIGIN_REFUSAL);
  }
  if (url.password.length > 0 || url.search.length > 0 || url.hash.length > 0) {
    return err(ORIGIN_REFUSAL);
  }
  if (url.protocol === "https:" && url.username.length > 0) return err(ORIGIN_REFUSAL);
  const identity = pathIdentity(url.pathname);
  if (isErr(identity)) return identity;
  url.username = "";
  url.password = "";
  return ok({ ...identity.value, originUrl: url.toString() });
}

function gitOrigin(repoRoot: string): Promise<Result<string, string>> {
  return new Promise((resolve) => {
    execFile("git", ["remote", "get-url", "origin"], { cwd: repoRoot }, (error, stdout) => {
      if (error !== null) {
        resolve(err(ORIGIN_REFUSAL));
        return;
      }
      resolve(ok(stdout));
    });
  });
}

export async function substrateClientForRepository(
  repoRoot: string,
  address: string,
  keyFile: string | undefined,
  sendRepository: boolean,
): Promise<SubstrateClient> {
  if (!sendRepository || address === "none") return substrateClientFor(address, keyFile);
  const origin = await gitOrigin(repoRoot);
  if (isErr(origin)) return refusalClient(address, origin.error);
  const repository = repositoryForOrigin(origin.value);
  if (isErr(repository)) return refusalClient(address, repository.error);
  return substrateClientFor(address, keyFile, repository.value);
}

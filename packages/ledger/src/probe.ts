import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { err, ok, type Result } from "@phyxiusjs/fp";

export const PROBE_CONFIG_SHAPE = "probe-config@v0";

export interface ProbeConfig {
  readonly interlock: typeof PROBE_CONFIG_SHAPE;
  readonly profile: Readonly<Record<string, string>>;
  readonly provider: Readonly<Record<string, string>>;
  readonly environment: Readonly<Record<string, string>>;
}

export interface ProbeConfigReference {
  readonly sha256: string;
  readonly path: string;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function probeConfigPath(directory: string, fingerprint: string): string {
  return join(directory, "probe", "config", `${fingerprint}.json`);
}

export function retainProbeConfig(
  directory: string,
  config: ProbeConfig,
): Result<ProbeConfigReference, string> {
  const body = `${JSON.stringify(config)}\n`;
  const fingerprint = sha256(body);
  const path = probeConfigPath(directory, fingerprint);
  try {
    mkdirSync(join(directory, "probe", "config"), { recursive: true });
    try {
      readFileSync(path);
    } catch {
      writeFileSync(path, body, { flag: "wx" });
    }
    return ok({ sha256: fingerprint, path });
  } catch (error) {
    return err(error instanceof Error ? error.message : "probe configuration cannot be retained");
  }
}

export function readProbeConfig(
  directory: string,
  fingerprint: string,
): Result<string, string> {
  try {
    return ok(readFileSync(probeConfigPath(directory, fingerprint), "utf8"));
  } catch (error) {
    return err(error instanceof Error ? error.message : "probe configuration cannot be read");
  }
}

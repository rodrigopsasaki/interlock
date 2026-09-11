import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { lastNonEmptyLine } from "runner";

export interface DispatchResult {
  readonly exitCode: number;
  readonly lastLine: string;
}

export type Dispatcher = (args: readonly string[]) => Promise<DispatchResult>;

export function defaultBinPath(): string {
  return fileURLToPath(new URL("../bin.ts", import.meta.url));
}

export function createDispatcher(
  binPath: string = defaultBinPath(),
  execPath: string = process.execPath,
): Dispatcher {
  return (args) =>
    new Promise((resolve) => {
      const child = spawn(execPath, [binPath, ...args]);
      let output = "";
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString("utf-8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        output += chunk.toString("utf-8");
      });
      child.on("close", (code) => {
        resolve({
          exitCode: code ?? -1,
          lastLine: lastNonEmptyLine(output) ?? "",
        });
      });
    });
}

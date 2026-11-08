import { execFileSync, spawn } from "node:child_process";
import { chmodSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { createInterface } from "node:readline";

interface InitMessage {
  readonly program: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly prompt: string;
  readonly promptOnStdin: boolean;
  readonly secret: string;
}

interface ControlMessage {
  readonly secret: string;
  readonly action: "TERM" | "KILL" | "end" | "members";
}

function textArg(index: number): string {
  const value = process.argv[index];
  if (value === undefined || value.length === 0)
    throw new Error(`missing launcher argument ${index}`);
  return value;
}

function atomicJson(path: string, value: unknown): void {
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  renameSync(temp, path);
}

function isEnvironment(value: unknown): value is NodeJS.ProcessEnv {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.entries(value).every(
      ([key, item]) => key.length > 0 && !key.includes("=") && typeof item === "string",
    )
  );
}

function writeExit(runDir: string, value: unknown): void {
  atomicJson(`${runDir}/exit.json`, value);
}

const runDir = textArg(2);
const nonce = textArg(3);
const socketPath = textArg(4);
mkdirSync(runDir, { recursive: true, mode: 0o700 });
const anchor = {
  interlock: "anchor@v0",
  pid: process.pid,
  pgid: process.pid,
  birth: `${process.pid}-${Date.now()}-${nonce}`,
  boot: `${process.platform}-${process.ppid}`,
  nonce,
};
atomicJson(`${runDir}/anchor.json`, anchor);

let init: InitMessage | undefined;
let child: ReturnType<typeof spawn> | undefined;
let childEnded = false;
let ended = false;
let childStartError = false;

process.on("SIGTERM", () => {});

function groupMembers(): readonly number[] {
  try {
    const candidates = execFileSync("ps", ["-o", "pid=", "-g", String(process.pid)], {
      encoding: "utf8",
    })
      .split(/\s+/)
      .filter((value) => value.length > 0)
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value !== process.pid);
    return candidates.filter((pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    });
  } catch {
    return childEnded ? [] : child?.pid === undefined ? [] : [child.pid];
  }
}

const server = createServer((socket) => {
  let input = "";
  socket.on("data", (chunk: Buffer) => {
    input += chunk.toString("utf8");
    const newline = input.indexOf("\n");
    if (newline === -1) return;
    const raw = input.slice(0, newline);
    input = input.slice(newline + 1);
    let message: ControlMessage | undefined;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "secret" in parsed &&
        typeof parsed.secret === "string" &&
        "action" in parsed &&
        (parsed.action === "TERM" ||
          parsed.action === "KILL" ||
          parsed.action === "end" ||
          parsed.action === "members")
      ) {
        message = { secret: parsed.secret, action: parsed.action };
      }
    } catch {
      message = undefined;
    }
    if (message === undefined || init?.secret !== message.secret) {
      socket.end(`${JSON.stringify({ ok: false, error: "unauthorized" })}\n`);
      return;
    }
    if (message.action === "members") {
      socket.end(`${JSON.stringify({ ok: true, members: groupMembers() })}\n`);
      return;
    }
    if (message.action === "end") {
      if (groupMembers().length > 0 || !childEnded) {
        socket.end(`${JSON.stringify({ ok: false, error: "program-running" })}\n`);
        return;
      }
      ended = true;
      socket.end(`${JSON.stringify({ ok: true })}\n`, () => {
        server.close(() => process.exit(0));
      });
      return;
    }
    try {
      process.kill(-process.pid, message.action === "TERM" ? "SIGTERM" : "SIGKILL");
      socket.end(`${JSON.stringify({ ok: true })}\n`);
    } catch (error) {
      socket.end(
        `${JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })}\n`,
      );
    }
  });
});

server.listen(socketPath, () => {
  chmodSync(socketPath, 0o600);
});

const input = createInterface({ input: process.stdin });
input.on("line", (line) => {
  if (init === undefined) {
    try {
      const parsed: unknown = JSON.parse(line);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "program" in parsed &&
        typeof parsed.program === "string" &&
        "args" in parsed &&
        Array.isArray(parsed.args) &&
        parsed.args.every((part) => typeof part === "string") &&
        "cwd" in parsed &&
        typeof parsed.cwd === "string" &&
        "env" in parsed &&
        isEnvironment(parsed.env) &&
        "prompt" in parsed &&
        typeof parsed.prompt === "string" &&
        "promptOnStdin" in parsed &&
        typeof parsed.promptOnStdin === "boolean" &&
        "secret" in parsed &&
        typeof parsed.secret === "string"
      ) {
        init = {
          program: parsed.program,
          args: parsed.args,
          cwd: parsed.cwd,
          env: parsed.env,
          prompt: parsed.prompt,
          promptOnStdin: parsed.promptOnStdin,
          secret: parsed.secret,
        };
      }
    } catch {
      init = undefined;
    }
    return;
  }
  if (line !== "go" || child !== undefined) return;
  atomicJson(`${runDir}/started.json`, { interlock: "started@v0", at: new Date().toISOString() });
  const spawned = spawn(init.program, [...init.args], {
    cwd: init.cwd,
    env: init.env,
    detached: false,
    stdio: ["pipe", "inherit", "inherit"],
  });
  child = spawned;
  if (init.promptOnStdin) {
    child.stdin?.end(init.prompt);
  } else {
    child.stdin?.end();
  }
  spawned.once("spawn", () => {
    atomicJson(`${runDir}/handoff.json`, {
      interlock: "handoff@v0",
      at: new Date().toISOString(),
    });
  });
  child.on("error", (error) => {
    childEnded = true;
    childStartError = true;
    const code = "code" in error && typeof error.code === "string" ? error.code : "unknown";
    writeExit(runDir, { interlock: "exit@v0", error: code });
  });
  child.on("close", (code, signal) => {
    childEnded = true;
    if (!childStartError) writeExit(runDir, { interlock: "exit@v0", code, signal });
    if (ended) server.close(() => process.exit(0));
  });
});

process.stdin.on("close", () => {
  if (child === undefined) process.exit(0);
});

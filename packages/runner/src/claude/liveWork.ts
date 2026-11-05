import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { LiveWork } from "../runtime.ts";
import { isRecord, isString, prop } from "../validate.ts";

const TERMINAL_TASK_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "failed",
  "killed",
  "stopped",
]);

const NOTIFICATION_PATTERN = /<task-notification>([\s\S]*?)<\/task-notification>/g;
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function claudeProjectsRoot(): string {
  const configured = process.env["CLAUDE_CONFIG_DIR"];
  const root =
    configured !== undefined && configured !== "" ? configured : join(homedir(), ".claude");
  return join(root, "projects");
}

interface ToolCall {
  readonly id: string;
  readonly name: string;
}

interface BackgroundLaunch {
  readonly call: ToolCall;
  readonly taskIds: readonly string[];
}

interface Finished {
  readonly toolUseId: string | undefined;
  readonly taskId: string | undefined;
}

function tagValue(block: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(block);
  return match?.[1]?.trim();
}

function finishedTasksIn(text: string): readonly Finished[] {
  return [...text.matchAll(NOTIFICATION_PATTERN)].flatMap((match) => {
    const block = match[1] ?? "";
    const status = tagValue(block, "status");
    if (status === undefined || !TERMINAL_TASK_STATUSES.has(status)) return [];
    return [{ toolUseId: tagValue(block, "tool-use-id"), taskId: tagValue(block, "task-id") }];
  });
}

function runtimeNotificationText(entry: Record<string, unknown>): string | undefined {
  if (prop(entry, "type") !== "attachment") return undefined;
  const attachment = prop(entry, "attachment");
  if (!isRecord(attachment) || prop(attachment, "type") !== "queued_command") return undefined;
  const origin = prop(attachment, "origin");
  const fromTask =
    prop(attachment, "commandMode") === "task-notification" ||
    (isRecord(origin) && prop(origin, "kind") === "task-notification");
  const prompt = prop(attachment, "prompt");
  return fromTask && isString(prompt) ? prompt : undefined;
}

function contentBlocks(entry: Record<string, unknown>): readonly Record<string, unknown>[] {
  const message = prop(entry, "message");
  const content = isRecord(message) ? prop(message, "content") : undefined;
  return Array.isArray(content) ? content.filter(isRecord) : [];
}

function backgroundTaskIds(result: unknown): readonly string[] | undefined {
  if (!isRecord(result)) return undefined;
  const launched = prop(result, "status") === "async_launched" || prop(result, "isAsync") === true;
  const ids = ["backgroundTaskId", "taskId", "agentId"]
    .map((key) => prop(result, key))
    .filter(isString);
  const hasTask = isString(prop(result, "backgroundTaskId")) || isString(prop(result, "taskId"));
  return launched || hasTask ? ids : undefined;
}

function describeCall(call: ToolCall): string {
  return `${call.name} call ${call.id}`;
}

export function liveWorkOfTranscript(text: string): LiveWork {
  if (text.length === 0) return { state: "unknown", because: "the transcript is empty" };
  if (!text.endsWith("\n")) {
    return { state: "unknown", because: "the transcript's last line is incomplete" };
  }

  const calls = new Map<string, ToolCall>();
  const answered = new Set<string>();
  const launches: BackgroundLaunch[] = [];
  const finished: Finished[] = [];

  const lines = text.slice(0, -1).split("\n");
  for (const [index, line] of lines.entries()) {
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      return { state: "unknown", because: `transcript line ${index + 1} does not parse` };
    }
    if (!isRecord(entry)) {
      return { state: "unknown", because: `transcript line ${index + 1} is not an entry` };
    }

    const notification = runtimeNotificationText(entry);
    if (notification !== undefined) finished.push(...finishedTasksIn(notification));

    const type = prop(entry, "type");
    const blocks = contentBlocks(entry);
    if (type === "assistant") {
      for (const block of blocks) {
        const id = prop(block, "id");
        const name = prop(block, "name");
        if (prop(block, "type") === "tool_use" && isString(id) && isString(name)) {
          calls.set(id, { id, name });
        }
      }
      continue;
    }
    if (type !== "user") continue;

    const results = blocks.flatMap((block) => {
      const id = prop(block, "tool_use_id");
      return prop(block, "type") === "tool_result" && isString(id) ? [id] : [];
    });
    for (const id of results) answered.add(id);
    const taskIds = backgroundTaskIds(prop(entry, "toolUseResult"));
    if (taskIds === undefined) continue;
    const [only, ...others] = results;
    if (only === undefined || others.length > 0) {
      return {
        state: "unknown",
        because: `transcript line ${index + 1} launches background work it does not tie to exactly one tool call`,
      };
    }
    launches.push({ call: calls.get(only) ?? { id: only, name: "tool" }, taskIds });
  }

  const pending = [...calls.values()].filter((call) => !answered.has(call.id));
  const running = launches.filter(
    (launch) =>
      !finished.some(
        (done) =>
          done.toolUseId === launch.call.id ||
          (done.taskId !== undefined && launch.taskIds.includes(done.taskId)),
      ),
  );
  const live = [
    ...pending.map((call) => `${describeCall(call)} has no result`),
    ...running.map((launch) => `background ${describeCall(launch.call)} has not finished`),
  ];
  return live.length === 0 ? { state: "none" } : { state: "live", because: live.join("; ") };
}

async function transcriptPath(
  sessionId: string,
  projectsRoot: string,
): Promise<{ readonly path: string } | { readonly because: string }> {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return { because: `"${sessionId}" is not a session id this runtime writes` };
  }
  let projects: readonly string[];
  try {
    projects = (await readdir(projectsRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    return {
      because: `${projectsRoot}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const file = `${sessionId}.jsonl`;
  const found = (
    await Promise.all(
      projects.map(async (project) =>
        (
          await readdir(join(projectsRoot, project)).catch((): readonly string[] => [])
        ).includes(file)
          ? [join(projectsRoot, project, file)]
          : [],
      ),
    )
  ).flat();
  const [path, ...others] = found;
  if (path === undefined) return { because: `no transcript for session ${sessionId}` };
  if (others.length > 0) return { because: `${found.length} transcripts for session ${sessionId}` };
  return { path };
}

export async function claudeLiveWork(
  sessionId: string,
  projectsRoot: string = claudeProjectsRoot(),
): Promise<LiveWork> {
  const located = await transcriptPath(sessionId, projectsRoot);
  if ("because" in located) return { state: "unknown", because: located.because };
  try {
    return liveWorkOfTranscript(await readFile(located.path, "utf-8"));
  } catch (error) {
    return {
      state: "unknown",
      because: `${located.path}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

import { watch, type FSWatcher } from "node:fs";
import { isErr } from "@phyxiusjs/fp";
import {
  findRepoRoot,
  initialFaceState,
  reduce,
  sharedJournalDirectory,
  verbCommand,
  type FaceKey,
  type FaceState,
  type FaceWorld,
} from "face";
import type { Runtime } from "runner";
import type { CommandResult } from "../main.ts";
import { createDispatcher, type Dispatcher } from "./dispatch.ts";
import { decodeKeys } from "./keys.ts";
import { focusSession } from "./focus.ts";
import { drawScreen, enterAltScreen, exitAltScreen } from "./terminal.ts";
import { renderScreen } from "./screen.ts";
import { buildGraphWorld, buildPlansWorld, buildSessionText } from "./world.ts";

const REDRAW_INTERVAL_MS = 2000;

export interface FaceOptions {
  readonly cwd?: string;
  readonly runtime?: Runtime;
  readonly dispatch?: Dispatcher;
  readonly stdin?: NodeJS.ReadStream;
  readonly stdout?: NodeJS.WriteStream;
  readonly keys?: AsyncIterable<FaceKey>;
  readonly by?: string;
}

function worldWithBy(world: FaceWorld, by: string | undefined): FaceWorld {
  return by === undefined ? world : { ...world, by };
}

async function* realKeys(stdin: NodeJS.ReadStream): AsyncIterable<FaceKey> {
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf-8");
  for await (const chunk of stdin) {
    for (const key of decodeKeys(String(chunk))) yield key;
  }
}

function watchJournalDirectory(
  path: string,
  onChange: () => void,
): FSWatcher | undefined {
  try {
    return watch(path, { persistent: false }, onChange);
  } catch {
    return undefined;
  }
}

export async function runInterlockFace(
  args: readonly string[],
  options: FaceOptions = {},
): Promise<CommandResult> {
  const [graph] = args;
  const cwd = options.cwd ?? process.cwd();
  const found = findRepoRoot(cwd);
  if (found === undefined) {
    return {
      exitCode: 1,
      message: `${cwd}: no .interlock directory found in this directory or any parent; expected to run inside an interlock repository.`,
    };
  }
  const repoRoot: string = found;

  const stdout = options.stdout ?? process.stdout;
  const dispatch = options.dispatch ?? createDispatcher();
  const by = options.by ?? process.env["INTERLOCK_BY"];

  let state: FaceState =
    graph === undefined
      ? initialFaceState()
      : { ...initialFaceState(), level: "graph", selection: { graph } };
  let world: FaceWorld = worldWithBy({ plans: [] }, by);
  let sessionText: string | undefined;

  async function refreshWorld(): Promise<void> {
    if (state.level === "plans") {
      world = worldWithBy(await buildPlansWorld(repoRoot, options.runtime), by);
      return;
    }
    const graphId = state.selection.graph ?? graph;
    if (graphId === undefined) return;
    const built = await buildGraphWorld(repoRoot, graphId, options.runtime);
    world = worldWithBy(isErr(built) ? { plans: [] } : built.value, by);

    if (
      state.level === "session" &&
      state.selection.node !== undefined &&
      state.selection.session !== undefined
    ) {
      sessionText = await buildSessionText(
        repoRoot,
        graphId,
        state.selection.node,
        state.selection.session,
      );
    } else {
      sessionText = undefined;
    }
  }

  function draw(): void {
    drawScreen(stdout, renderScreen(state, world, sessionText));
  }

  async function handle(key: FaceKey): Promise<boolean> {
    const reduced = reduce(state, key, world);
    state = reduced.state;
    const effect = reduced.effect;
    if (effect === undefined) {
      await refreshWorld();
      draw();
      return true;
    }
    if (effect.kind === "quit") return false;
    if (effect.kind === "redraw") {
      await refreshWorld();
      draw();
      return true;
    }
    if (effect.kind === "focus") {
      if (options.runtime !== undefined) {
        await focusSession(options.runtime, {
          graph: effect.graph,
          node: effect.node,
          session: effect.session,
        });
      }
      draw();
      return true;
    }
    const result = await dispatch(
      verbCommand(effect.verb, { by: effect.by, because: effect.because }),
    );
    await refreshWorld();
    if (state.kind === "browsing") {
      state = {
        ...state,
        status: `exit ${result.exitCode}: ${result.lastLine}`,
      };
    }
    draw();
    return true;
  }

  await refreshWorld();

  const usingRealKeys = options.keys === undefined;
  const keys = options.keys ?? realKeys(options.stdin ?? process.stdin);

  enterAltScreen(stdout);
  draw();

  const watcher = usingRealKeys
    ? watchJournalDirectory(sharedJournalDirectory(repoRoot), () => {
        void refreshWorld().then(draw);
      })
    : undefined;
  const timer = usingRealKeys
    ? setInterval(() => void refreshWorld().then(draw), REDRAW_INTERVAL_MS)
    : undefined;
  const onResize = () => draw();
  if (usingRealKeys) stdout.on("resize", onResize);

  try {
    for await (const key of keys) {
      const keepGoing = await handle(key);
      if (!keepGoing) break;
    }
  } finally {
    if (usingRealKeys) stdout.off("resize", onResize);
    if (timer !== undefined) clearInterval(timer);
    watcher?.close();
    exitAltScreen(stdout);
  }

  return { exitCode: 0, message: "" };
}

import { watch, type FSWatcher } from "node:fs";
import { createSystemClock, type Clock } from "@phyxiusjs/clock";
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
  type Selection,
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
  readonly clock?: Clock;
  readonly dispatch?: Dispatcher;
  readonly stdin?: NodeJS.ReadStream;
  readonly stdout?: NodeJS.WriteStream;
  readonly keys?: AsyncIterable<FaceKey>;
  readonly by?: string;
}

function worldWithBy(world: FaceWorld, by: string | undefined): FaceWorld {
  return by === undefined ? world : { ...world, by };
}

function selectionsEqual(a: Selection, b: Selection): boolean {
  return a.graph === b.graph && a.node === b.node && a.session === b.session;
}

function needsWorldRefresh(previous: FaceState, next: FaceState): boolean {
  return (
    previous.kind !== next.kind ||
    previous.level !== next.level ||
    !selectionsEqual(previous.selection, next.selection)
  );
}

function bufferedKeys(stdin: NodeJS.ReadStream): AsyncIterable<FaceKey> {
  const queue: FaceKey[] = [];
  const waiters: ((result: IteratorResult<FaceKey>) => void)[] = [];
  let ended = false;

  function push(key: FaceKey): void {
    const waiter = waiters.shift();
    if (waiter === undefined) {
      queue.push(key);
    } else {
      waiter({ value: key, done: false });
    }
  }

  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.setEncoding("utf-8");
  stdin.on("data", (chunk: string) => {
    for (const key of decodeKeys(chunk)) push(key);
  });
  stdin.on("end", () => {
    ended = true;
    for (const waiter of waiters.splice(0)) {
      waiter({ value: undefined, done: true });
    }
  });
  stdin.resume();

  return {
    [Symbol.asyncIterator](): AsyncIterator<FaceKey> {
      return {
        next(): Promise<IteratorResult<FaceKey>> {
          const queued = queue.shift();
          if (queued !== undefined) {
            return Promise.resolve({ value: queued, done: false });
          }
          if (ended) return Promise.resolve({ value: undefined, done: true });
          return new Promise((resolve) => waiters.push(resolve));
        },
      };
    },
  };
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
  const clock = options.clock ?? createSystemClock();

  let state: FaceState =
    graph === undefined
      ? initialFaceState()
      : { ...initialFaceState(), level: "graph", selection: { graph } };
  let world: FaceWorld = worldWithBy({ plans: [] }, by);
  let sessionText: string | undefined;

  async function refreshWorld(): Promise<void> {
    if (state.level === "plans") {
      world = worldWithBy(
        await buildPlansWorld(repoRoot, options.runtime, clock),
        by,
      );
      return;
    }
    const graphId = state.selection.graph ?? graph;
    if (graphId === undefined) return;
    const built = await buildGraphWorld(
      repoRoot,
      graphId,
      options.runtime,
      clock,
    );
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
    const previous = state;
    const reduced = reduce(state, key, world);
    state = reduced.state;
    const effect = reduced.effect;
    if (effect === undefined) {
      if (needsWorldRefresh(previous, state)) await refreshWorld();
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
  const keys = options.keys ?? bufferedKeys(options.stdin ?? process.stdin);

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

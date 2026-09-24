import type { Clock } from "@phyxiusjs/clock";
import { ms } from "@phyxiusjs/clock";
import { isErr, isOk, ok, type Result } from "@phyxiusjs/fp";
import type { Agent, AgentStatus, Runtime, RuntimeRefusal } from "./runtime.ts";
import { matchesScreen, type StartupAnswer } from "./startupAnswers.ts";

const TAKEN_STATUSES: readonly AgentStatus[] = ["working", "blocked", "done"];
const SUBMIT_KEYSTROKE: readonly string[] = ["Enter"];

export interface PromptDeliveryRequest {
  readonly runtime: Runtime;
  readonly agent: Agent;
  readonly clock: Clock;
  readonly narrate: (line: string) => void;
  readonly prompt: string;
  readonly readySettleMs: number;
  readonly promptRetries: number;
  readonly promptTakenTimeoutMs: number;
  readonly answerGraceMs: number;
  readonly startupAnswers: readonly StartupAnswer[];
}

export type PromptDeliveryOutcome =
  | { readonly kind: "taken"; readonly status: AgentStatus }
  | { readonly kind: "resumed-in-grace" }
  | { readonly kind: "abandoned"; readonly attempts: number };

function isIdleTimeout(refusal: RuntimeRefusal): boolean {
  return refusal.kind === "timeout" && refusal.status === "idle";
}

function promptCallCode(refusal: RuntimeRefusal): string {
  return refusal.kind === "remote" ? refusal.code : refusal.kind;
}

async function matchStartupAnswer(
  runtime: Runtime,
  agent: Agent,
  narrate: (line: string) => void,
  startupAnswers: readonly StartupAnswer[],
): Promise<Result<boolean, RuntimeRefusal>> {
  const screen = await runtime.read(agent);
  if (isErr(screen)) return screen;

  const matched = startupAnswers.find((answer) => matchesScreen(answer.matches, screen.value));
  if (matched === undefined) return ok(false);

  const sent = await runtime.sendKeys(agent, matched.keys);
  if (isErr(sent)) return sent;
  narrate(`startup answer matched "${matched.matches}"; sent ${matched.keys.join(" ")}`);
  return ok(true);
}

export async function deliverOpeningPrompt(
  request: PromptDeliveryRequest,
): Promise<Result<PromptDeliveryOutcome, RuntimeRefusal>> {
  const {
    runtime,
    agent,
    clock,
    narrate,
    prompt,
    readySettleMs,
    promptRetries,
    promptTakenTimeoutMs,
    answerGraceMs,
    startupAnswers,
  } = request;

  if (readySettleMs > 0) {
    narrate(`settling ${readySettleMs}ms before the opening prompt`);
    await clock.sleep(ms(readySettleMs));
  }

  if (startupAnswers.length > 0) {
    const preAnswered = await matchStartupAnswer(runtime, agent, narrate, startupAnswers);
    if (isErr(preAnswered)) return preAnswered;
  }

  const totalAttempts = promptRetries + 1;
  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    const isKeystrokeAttempt = attempt % 2 === 0;

    if (isKeystrokeAttempt) {
      const matched = await matchStartupAnswer(runtime, agent, narrate, startupAnswers);
      if (isErr(matched)) return matched;
      if (!matched.value) {
        const sent = await runtime.sendPaneKeys(agent.pane, SUBMIT_KEYSTROKE);
        if (isErr(sent)) return sent;
      }
    } else {
      const sent = await runtime.prompt(agent, prompt);
      if (isErr(sent)) {
        narrate(`prompt call returned ${promptCallCode(sent.error)}; waiting for working`);
      } else if (attempt === 1) {
        narrate("prompt sent");
      }
    }

    const waited = await runtime.waitUntil(agent, TAKEN_STATUSES, promptTakenTimeoutMs);
    if (isOk(waited)) {
      if (waited.value === "working") narrate("agent working");
      return ok({ kind: "taken", status: waited.value });
    }
    if (!isIdleTimeout(waited.error)) return waited;

    if (attempt < totalAttempts) {
      const nextIsKeystroke = (attempt + 1) % 2 === 0;
      const nextAction = nextIsKeystroke ? "submit keystroke" : "opening prompt";
      narrate(
        `prompt not taken after ${promptTakenTimeoutMs}ms; retrying (${attempt} of ${promptRetries}): ${nextAction}`,
      );
    }
  }

  narrate(
    `opening prompt not taken after ${totalAttempts} attempts; pane ${agent.pane.id} stays open; a person may deliver it by hand`,
  );
  const resumed = await runtime.waitUntil(agent, ["working"], answerGraceMs);
  if (isOk(resumed)) {
    narrate("agent working");
    return ok({ kind: "resumed-in-grace" });
  }
  return ok({ kind: "abandoned", attempts: totalAttempts });
}

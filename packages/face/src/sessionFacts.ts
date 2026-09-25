import type { SessionFact, SessionFacts } from "ledger";

function renderFact<T>(fact: SessionFact<T>, render: (value: T) => string): string {
  return fact.state === "unknown" ? "unknown" : render(fact.value);
}

function renderUsage(usage: SessionFacts["usage"]): string {
  return renderFact(usage, (value) => {
    const counters = Object.entries(value.raw);
    return counters.length === 0
      ? "(empty)"
      : counters.map(([name, counter]) => `${name}=${counter}`).join(", ");
  });
}

function renderQuota(quota: SessionFacts["quota"]): string {
  return renderFact(quota, (value) => `window=${value.window}, used=${value.usedPercentage}%`);
}

export function renderSessionFacts(facts: SessionFacts): readonly string[] {
  return [
    `Prompt received: ${renderFact(facts.promptReceived, (value) => value)}`,
    `Last activity: ${renderFact(facts.lastActivity, (value) => value)}`,
    `Usage: ${renderUsage(facts.usage)}`,
    `Quota: ${renderQuota(facts.quota)}`,
    `Delivery basis: ${facts.deliveryBasis}`,
  ];
}

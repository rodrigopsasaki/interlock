import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import type { Debrief, Node, Note, Receipt } from "ledger";
import type {
  AbsorbOutcome,
  ContextOutcome,
  EvidenceForAbsorb,
  SubstrateClient,
} from "./client.ts";
import { readBearerToken } from "./keyFile.ts";
import {
  absorbResponseSchema,
  capabilitiesResponseSchema,
  contextResponseSchema,
} from "./registry.ts";
import { toWireDebrief, toWireNotes } from "./wire.ts";

const CALL_TIMEOUT_MS = 5_000;

function endpoint(address: string, verb: string): string {
  return `${address.replace(/\/+$/, "")}/substrate@v1/${verb}`;
}

async function authHeaders(
  keyFile: string | undefined,
): Promise<Result<Record<string, string>, string>> {
  if (keyFile === undefined) return ok({});
  const token = await readBearerToken(keyFile);
  if (isErr(token)) return token;
  return ok({ Authorization: `Bearer ${token.value}` });
}

async function post(
  address: string,
  verb: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<Result<unknown, string>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint(address, verb), {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      return err(`${verb} ${address}: HTTP ${response.status}`);
    }
    const text = await response.text();
    try {
      const parsed: unknown = JSON.parse(text);
      return ok(parsed);
    } catch {
      return err(`${verb} ${address}: response was not JSON`);
    }
  } catch (error) {
    const because = error instanceof Error ? error.message : String(error);
    return err(`${verb} ${address}: ${because}`);
  } finally {
    clearTimeout(timer);
  }
}

export function httpClient(address: string, keyFile?: string): SubstrateClient {
  let cachedCapabilities: readonly string[] | undefined;

  async function capabilities(): Promise<readonly string[]> {
    if (cachedCapabilities !== undefined) return cachedCapabilities;
    const headers = await authHeaders(keyFile);
    if (isErr(headers)) return [];
    const response = await post(address, "capabilities", headers.value, {});
    if (isErr(response)) return [];
    const body = response.value;
    if (
      capabilitiesResponseSchema === undefined ||
      !capabilitiesResponseSchema.validate(body)
    ) {
      return [];
    }
    cachedCapabilities = body.capabilities;
    return cachedCapabilities;
  }

  async function context(
    node: Node,
    scope: readonly string[],
    role: string,
  ): Promise<ContextOutcome> {
    const headers = await authHeaders(keyFile);
    if (isErr(headers)) return { kind: "refused", because: headers.error };
    const response = await post(address, "context", headers.value, {
      node,
      scope,
      role,
    });
    if (isErr(response)) return { kind: "refused", because: response.error };
    const body = response.value;
    if (contextResponseSchema === undefined) {
      return {
        kind: "refused",
        because: "no compiled response schema for context",
      };
    }
    if (!contextResponseSchema.validate(body)) {
      return { kind: "refused", because: contextResponseSchema.errors() };
    }
    return {
      kind: "rendered",
      items: body.items,
      vocabulary: body.vocabulary,
    };
  }

  async function absorb(
    node: Node,
    debrief: Debrief,
    notes: readonly Note[],
    receipts: readonly Receipt[],
    evidence?: EvidenceForAbsorb,
  ): Promise<AbsorbOutcome> {
    const headers = await authHeaders(keyFile);
    if (isErr(headers)) return { kind: "refused", because: headers.error };
    const response = await post(address, "absorb", headers.value, {
      debrief: toWireDebrief(debrief),
      notes: toWireNotes(node.id, notes),
      receipts,
      ...(evidence === undefined
        ? {}
        : { items: evidence.items, gaps: evidence.gaps }),
    });
    if (isErr(response)) return { kind: "refused", because: response.error };
    const body = response.value;
    if (absorbResponseSchema === undefined) {
      return {
        kind: "refused",
        because: "no compiled response schema for absorb",
      };
    }
    if (!absorbResponseSchema.validate(body)) {
      return { kind: "refused", because: absorbResponseSchema.errors() };
    }
    return {
      kind: "acknowledged",
      decisionsAbsorbed: body.decisions_absorbed,
      discoveries: body.discoveries,
      gaps: body.gaps,
    };
  }

  return { address, context, absorb, capabilities };
}

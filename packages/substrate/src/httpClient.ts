import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import type { Debrief, Node, Note, Receipt } from "ledger";
import type {
  AbsorbDispatch,
  AbsorbOutcome,
  ContextOutcome,
  EvidenceForAbsorb,
  PreparedAbsorb,
  Repository,
  SubstrateClient,
} from "./client.ts";
import { readBearerToken } from "./keyFile.ts";
import {
  absorbResponseSchema,
  capabilitiesResponseSchema,
  contextResponseSchema,
} from "./registry.ts";
import { receivedHttpRefusal } from "./responseDetail.ts";
import { toWireDebrief, toWireNotes } from "./wire.ts";

const CALL_TIMEOUT_MS = 5_000;

function endpoint(address: string, verb: string): string {
  return `${address.replace(/\/+$/, "")}/substrate@v1/${verb}`;
}

function safeEndpoint(address: string, verb: string): string | undefined {
  try {
    const parsed = new URL(address);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username.length > 0 ||
      parsed.password.length > 0 ||
      parsed.search.length > 0 ||
      parsed.hash.length > 0
    ) {
      return undefined;
    }
    return endpoint(parsed.toString(), verb);
  } catch {
    return undefined;
  }
}

function hasSafeRepository(repository: Repository | undefined): boolean {
  if (repository === undefined) return true;
  if (repository.originUrl.includes("?") || repository.originUrl.includes("#")) return false;
  try {
    const parsed = new URL(repository.originUrl);
    return parsed.username.length === 0 && parsed.password.length === 0;
  } catch {
    return true;
  }
}

async function authHeaders(
  keyFile: string | undefined,
): Promise<
  Result<{ readonly headers: Record<string, string>; readonly bearerToken?: string }, string>
> {
  if (keyFile === undefined) return ok({ headers: {} });
  const token = await readBearerToken(keyFile);
  if (isErr(token)) return token;
  return ok({
    headers: { Authorization: `Bearer ${token.value}` },
    bearerToken: token.value,
  });
}

interface RequestSpec {
  readonly method: "GET" | "POST";
  readonly headers: Record<string, string>;
  readonly body?: unknown;
}

async function call(
  address: string,
  verb: string,
  spec: RequestSpec,
  bearerToken: string | undefined,
): Promise<Result<unknown, string>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint(address, verb), {
      method: spec.method,
      headers: spec.headers,
      ...(spec.body === undefined ? {} : { body: JSON.stringify(spec.body) }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return err(await receivedHttpRefusal(verb, address, response, bearerToken));
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

async function post(
  address: string,
  verb: string,
  headers: Record<string, string>,
  body: unknown,
  bearerToken: string | undefined,
): Promise<Result<unknown, string>> {
  return call(
    address,
    verb,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    },
    bearerToken,
  );
}

async function dispatch(
  address: string,
  target: string,
  headers: Record<string, string>,
  request: string,
  bearerToken: string | undefined,
): Promise<
  | { readonly kind: "response"; readonly raw: Buffer }
  | { readonly kind: "uncertain"; readonly because: string }
> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    const response = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: request,
      signal: controller.signal,
    });
    if (!response.ok)
      return {
        kind: "uncertain",
        because: await receivedHttpRefusal("absorb", address, response, bearerToken),
      };
    return { kind: "response", raw: Buffer.from(await response.arrayBuffer()) };
  } catch {
    return { kind: "uncertain", because: "absorb transport did not confirm a response" };
  } finally {
    clearTimeout(timer);
  }
}

async function get(
  address: string,
  verb: string,
  headers: Record<string, string>,
  bearerToken: string | undefined,
): Promise<Result<unknown, string>> {
  return call(address, verb, { method: "GET", headers }, bearerToken);
}

export function httpClient(
  address: string,
  keyFile?: string,
  repository?: Repository,
): SubstrateClient {
  let cachedCapabilities: readonly string[] | undefined;

  async function capabilities(): Promise<readonly string[]> {
    if (cachedCapabilities !== undefined) return cachedCapabilities;
    const headers = await authHeaders(keyFile);
    if (isErr(headers)) return [];
    const response = await get(
      address,
      "capabilities",
      headers.value.headers,
      headers.value.bearerToken,
    );
    if (isErr(response)) return [];
    const body = response.value;
    if (capabilitiesResponseSchema === undefined || !capabilitiesResponseSchema.validate(body)) {
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
    const response = await post(
      address,
      "context",
      headers.value.headers,
      {
        node,
        scope,
        role,
        ...(repository === undefined
          ? {}
          : {
              repository: {
                owner: repository.owner,
                name: repository.name,
                origin_url: repository.originUrl,
              },
            }),
      },
      headers.value.bearerToken,
    );
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
    const prepared = await prepareAbsorb(node, debrief, notes, receipts, evidence);
    if (prepared.kind === "none") return { kind: "empty" };
    if (prepared.kind === "refused") return prepared;
    const sent = await dispatchAbsorb(prepared);
    return sent.kind === "acknowledged" ? sent.outcome : { kind: "refused", because: sent.because };
  }

  async function prepareAbsorb(
    node: Node,
    debrief: Debrief,
    notes: readonly Note[],
    receipts: readonly Receipt[],
    evidence?: EvidenceForAbsorb,
  ): Promise<PreparedAbsorb> {
    const target = safeEndpoint(address, "absorb");
    if (target === undefined) return { kind: "refused", because: "absorb address is unsafe" };
    if (!hasSafeRepository(repository)) {
      return { kind: "refused", because: "absorb repository is unsafe" };
    }
    return {
      kind: "ready",
      target,
      request: JSON.stringify({
        debrief: toWireDebrief(debrief),
        notes: toWireNotes(node.id, notes),
        receipts,
        ...(evidence === undefined ? {} : { items: evidence.items, gaps: evidence.gaps }),
        ...(repository === undefined
          ? {}
          : {
              repository: {
                owner: repository.owner,
                name: repository.name,
                origin_url: repository.originUrl,
              },
            }),
      }),
      ...(repository === undefined ? {} : { repository }),
    };
  }

  async function dispatchAbsorb(
    prepared: Extract<PreparedAbsorb, { readonly kind: "ready" }>,
  ): Promise<AbsorbDispatch> {
    const headers = await authHeaders(keyFile);
    if (isErr(headers))
      return { kind: "uncertain", because: "absorb credentials were unavailable" };
    const received = await dispatch(
      address,
      prepared.target,
      headers.value.headers,
      prepared.request,
      headers.value.bearerToken,
    );
    if (received.kind === "uncertain") return received;
    let body: unknown;
    try {
      body = JSON.parse(received.raw.toString("utf-8"));
    } catch {
      return { kind: "uncertain", because: "absorb response was not JSON" };
    }
    if (absorbResponseSchema === undefined) {
      return { kind: "uncertain", because: "no compiled response schema for absorb" };
    }
    if (!absorbResponseSchema.validate(body)) {
      return { kind: "uncertain", because: "absorb response did not match its schema" };
    }
    return {
      kind: "acknowledged",
      outcome: {
        kind: "acknowledged",
        decisionsAbsorbed: body.decisions_absorbed,
        discoveries: body.discoveries,
        gaps: body.gaps,
      },
      response: received.raw,
    };
  }

  return { address, context, absorb, prepareAbsorb, dispatchAbsorb, capabilities };
}

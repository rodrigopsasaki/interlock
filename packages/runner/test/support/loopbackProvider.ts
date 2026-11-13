import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

interface JsonObject {
  readonly [key: string]: unknown;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null;
}

async function requestJson(request: IncomingMessage): Promise<JsonObject> {
  let body = "";
  request.setEncoding("utf8");
  for await (const chunk of request) body += chunk;
  const parsed: unknown = JSON.parse(body);
  if (!isRecord(parsed)) throw new Error("the provider request was not a JSON object");
  return parsed;
}

function responseBody(requests: readonly JsonObject[]): JsonObject {
  return {
    id: `resp_loopback_${String(requests.length)}`,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model: "loopback-fixture",
    output: [
      {
        id: `message_loopback_${String(requests.length)}`,
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: "loopback proof", annotations: [] }],
      },
    ],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  };
}

function respond(response: ServerResponse, body: JsonObject): void {
  response.statusCode = 200;
  response.setHeader("content-type", "text/event-stream");
  response.setHeader("cache-control", "no-cache");
  const created = { ...body, status: "in_progress", output: [] };
  response.write(`data: ${JSON.stringify({ type: "response.created", response: created })}\n\n`);
  response.write(`data: ${JSON.stringify({ type: "response.completed", response: body })}\n\n`);
  response.end("data: [DONE]\n\n");
}

export async function startLoopbackProvider(): Promise<{
  readonly url: string;
  readonly requests: JsonObject[];
  readonly close: () => Promise<void>;
}> {
  const requests: JsonObject[] = [];
  const server = createServer(async (request, response) => {
    if (request.method !== "POST") {
      response.statusCode = 404;
      response.end();
      return;
    }
    try {
      requests.push(await requestJson(request));
      respond(response, responseBody(requests));
    } catch (error) {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : String(error));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error("the loopback provider did not expose a port");
  }
  return {
    url: `http://127.0.0.1:${String(address.port)}/v1`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

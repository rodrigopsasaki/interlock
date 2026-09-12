import { createServer, type IncomingMessage, type Server } from "node:http";

export interface RecordedCall {
  readonly verb: string;
  readonly authorization: string | undefined;
  readonly body: unknown;
}

export interface FakeSubstrateServer {
  readonly url: string;
  readonly calls: readonly RecordedCall[];
  responseFor(verb: string, body: unknown, status?: number): void;
  hangOn(verb: string): void;
  close(): Promise<void>;
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let raw = "";
    request.on("data", (chunk: Buffer) => {
      raw += chunk.toString("utf-8");
    });
    request.on("end", () => resolve(raw));
  });
}

// An http listener in the test's own directory, port from the OS: every verb this package
// speaks answers from a table the test fills in, so a schema-valid, a malformed and an absent
// response are all the same fixture, configured differently per test.
export function startFakeSubstrateServer(): Promise<FakeSubstrateServer> {
  const calls: RecordedCall[] = [];
  const responses = new Map<string, { readonly body: unknown; readonly status: number }>();
  const hanging = new Set<string>();

  const server: Server = createServer((request, response) => {
    const verb = (request.url ?? "").split("/").pop() ?? "";
    void readBody(request).then((raw) => {
      let body: unknown;
      try {
        body = raw.length === 0 ? {} : JSON.parse(raw);
      } catch {
        body = raw;
      }
      calls.push({
        verb,
        authorization: request.headers.authorization,
        body,
      });
      if (verb === "capabilities" && request.method !== "GET") {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({}));
        return;
      }
      if (hanging.has(verb)) return;
      const configured = responses.get(verb) ?? { body: {}, status: 200 };
      response.writeHead(configured.status, {
        "content-type": "application/json",
      });
      response.end(JSON.stringify(configured.body));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        calls,
        responseFor(verb, body, status = 200) {
          responses.set(verb, { body, status });
        },
        hangOn(verb) {
          hanging.add(verb);
        },
        close() {
          return new Promise((resolveClose) => server.close(() => resolveClose()));
        },
      });
    });
  });
}

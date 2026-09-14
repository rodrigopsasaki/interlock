import { describe, expect, it } from "vitest";
import { receivedHttpRefusal } from "../src/responseDetail.ts";

const encoder = new TextEncoder();

describe("receivedHttpRefusal", () => {
  it("cancels at an exact intake boundary without reading the following stream chunk", async () => {
    let cancelled = false;
    let followingChunkRead = false;
    const response = new Response(
      new ReadableStream<Uint8Array>(
        {
          start(controller) {
            controller.enqueue(encoder.encode("x".repeat(1024)));
          },
          pull(controller) {
            followingChunkRead = true;
            controller.enqueue(encoder.encode("more"));
          },
          cancel() {
            cancelled = true;
          },
        },
        { highWaterMark: 0 },
      ),
      { headers: { "content-type": "text/plain" }, status: 429 },
    );

    const refusal = await receivedHttpRefusal("context", "http://local", response, undefined);

    expect(refusal).toContain("context http://local: HTTP 429");
    expect(refusal).toContain("body limited to 1024 bytes");
    expect(cancelled).toBe(true);
    expect(followingChunkRead).toBe(false);
  });

  it("keeps the received status when body reading fails", async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new Error("reader failed"));
        },
      }),
      { headers: { "content-type": "text/plain" }, status: 503 },
    );

    await expect(receivedHttpRefusal("absorb", "http://local", response, undefined)).resolves.toBe(
      "absorb http://local: HTTP 503",
    );
  });

  it("keeps the received status when cancellation rejects", async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>(
        {
          start(controller) {
            controller.enqueue(encoder.encode("x".repeat(1024)));
          },
          cancel() {
            return Promise.reject(new Error("cancellation failed"));
          },
        },
        { highWaterMark: 0 },
      ),
      { headers: { "content-type": "text/plain" }, status: 504 },
    );

    const refusal = await receivedHttpRefusal("context", "http://local", response, undefined);

    expect(refusal).toContain("context http://local: HTTP 504");
    expect(refusal).toContain("body limited to 1024 bytes");
  });
});

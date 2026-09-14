const BODY_LIMIT_BYTES = 1024;
const DETAIL_LIMIT_CHARACTERS = 512;
const BODY_LIMITED = `body limited to ${BODY_LIMIT_BYTES} bytes`;
const DETAIL_TRUNCATED = `detail truncated at ${DETAIL_LIMIT_CHARACTERS} characters`;

interface CollectedBody {
  readonly limited: boolean;
  readonly text: string;
}

type DeclaredMedia = "json" | "plain-text" | "other";

function declaredMedia(response: Response): DeclaredMedia {
  const contentType = response.headers.get("content-type");
  if (contentType === null) return "other";
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType === "application/json" || mediaType?.endsWith("+json") === true) {
    return "json";
  }
  if (mediaType === "text/plain") return "plain-text";
  return "other";
}

async function collectBody(response: Response): Promise<CollectedBody> {
  if (response.body === null) return { limited: false, text: "" };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let limited = false;
  try {
    while (length < BODY_LIMIT_BYTES) {
      const next = await reader.read();
      if (next.done) break;
      const remaining = BODY_LIMIT_BYTES - length;
      if (next.value.byteLength > remaining) {
        chunks.push(next.value.slice(0, remaining));
        length += remaining;
      } else {
        chunks.push(next.value);
        length += next.value.byteLength;
      }
      if (length === BODY_LIMIT_BYTES) {
        limited = true;
        await reader.cancel();
        break;
      }
    }
  } catch {
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { limited, text: new TextDecoder().decode(body) };
}

function jsonExplanation(body: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || !Object.hasOwn(parsed, "error")) {
    return undefined;
  }
  const error = Reflect.get(parsed, "error");
  if (typeof error === "string") return error;
  if (typeof error !== "object" || error === null || !Object.hasOwn(error, "message")) {
    return undefined;
  }
  const message = Reflect.get(error, "message");
  return typeof message === "string" ? message : undefined;
}

function csiEnd(code: number): boolean {
  return code >= 0x40 && code <= 0x7e;
}

function skipCsi(value: string, index: number): number {
  let cursor = index;
  while (cursor < value.length) {
    if (csiEnd(value.charCodeAt(cursor))) return cursor + 1;
    cursor += 1;
  }
  return cursor;
}

function skipOsc(value: string, index: number): number {
  let cursor = index;
  while (cursor < value.length) {
    const code = value.charCodeAt(cursor);
    if (code === 7) return cursor + 1;
    if (code === 27 && value.charCodeAt(cursor + 1) === 92) return cursor + 2;
    cursor += 1;
  }
  return cursor;
}

function normalize(value: string): string {
  let normalized = "";
  let spacing = false;
  let index = 0;
  while (index < value.length) {
    const code = value.charCodeAt(index);
    if (code === 27) {
      const next = value.charCodeAt(index + 1);
      index =
        next === 91
          ? skipCsi(value, index + 2)
          : next === 93
            ? skipOsc(value, index + 2)
            : index + 1;
      spacing = normalized.length > 0;
      continue;
    }
    if (code === 155) {
      index = skipCsi(value, index + 1);
      spacing = normalized.length > 0;
      continue;
    }
    const character = value.at(index);
    if (character === undefined) break;
    index += 1;
    if (code <= 31 || (code >= 127 && code <= 159) || character.trim().length === 0) {
      spacing = normalized.length > 0;
      continue;
    }
    normalized += `${spacing ? " " : ""}${character}`;
    spacing = false;
  }
  return normalized;
}

function redact(value: string, bearerToken: string | undefined): string {
  if (bearerToken === undefined) return value;
  const replaced = value.split(bearerToken).join("[redacted]");
  const maximumPrefixLength = Math.min(replaced.length, bearerToken.length - 1);
  for (let length = maximumPrefixLength; length > 0; length -= 1) {
    if (replaced.endsWith(bearerToken.slice(0, length))) {
      return replaced.slice(0, -length);
    }
  }
  return replaced;
}

function suffix(parts: readonly string[]): string {
  return parts.length === 0 ? "" : ` [${parts.join("; ")}]`;
}

function renderDetail(
  explanation: string | undefined,
  bodyLimited: boolean,
  bearerToken: string | undefined,
): string | undefined {
  const normalized = explanation === undefined ? "" : redact(normalize(explanation), bearerToken);
  const markers = bodyLimited ? [BODY_LIMITED] : [];
  let ending = suffix(markers);
  if (normalized.length + ending.length <= DETAIL_LIMIT_CHARACTERS) {
    return normalized.length === 0 && ending.length === 0 ? undefined : `${normalized}${ending}`;
  }
  ending = suffix([...markers, DETAIL_TRUNCATED]);
  const displayed = redact(
    normalized.slice(0, DETAIL_LIMIT_CHARACTERS - ending.length),
    bearerToken,
  );
  return `${displayed}${ending}`;
}

export async function responseDetail(
  response: Response,
  bearerToken: string | undefined,
): Promise<string | undefined> {
  const media = declaredMedia(response);
  const body = await collectBody(response);
  const explanation =
    media === "json" ? jsonExplanation(body.text) : media === "plain-text" ? body.text : undefined;
  return renderDetail(explanation, body.limited, bearerToken);
}

export async function receivedHttpRefusal(
  verb: string,
  address: string,
  response: Response,
  bearerToken: string | undefined,
): Promise<string> {
  const detail = await responseDetail(response, bearerToken);
  return `${verb} ${address}: HTTP ${response.status}${detail === undefined ? "" : `: ${detail}`}`;
}

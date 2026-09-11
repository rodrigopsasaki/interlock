import type { FaceKey } from "face";

export function decodeKeys(chunk: string): readonly FaceKey[] {
  const keys: FaceKey[] = [];
  let index = 0;
  while (index < chunk.length) {
    if (chunk[index] === "\x1b") {
      if (chunk.slice(index, index + 3) === "\x1b[A") {
        keys.push({ name: "up" });
        index += 3;
        continue;
      }
      if (chunk.slice(index, index + 3) === "\x1b[B") {
        keys.push({ name: "down" });
        index += 3;
        continue;
      }
      keys.push({ name: "escape" });
      index += 1;
      continue;
    }
    if (chunk[index] === "\r" || chunk[index] === "\n") {
      keys.push({ name: "enter" });
      index += 1;
      continue;
    }
    if (chunk[index] === "\x7f" || chunk[index] === "\x08") {
      keys.push({ name: "backspace" });
      index += 1;
      continue;
    }
    const char = chunk[index];
    if (char !== undefined) keys.push({ name: "char", char });
    index += 1;
  }
  return keys;
}

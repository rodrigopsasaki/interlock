const CONTEXT_HEADING = "## Context slice";

interface ContextSliceBounds {
  readonly headingIndex: number;
  readonly sectionEnd: number;
}

export type ContextSlice =
  | { readonly kind: "absent" }
  | { readonly kind: "present"; readonly body: string };

function contextSliceBounds(lines: readonly string[]): ContextSliceBounds | undefined {
  const headingIndex = lines.findIndex((line) => line.trim() === CONTEXT_HEADING);
  if (headingIndex === -1) return undefined;

  let sectionEnd = lines.length;
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    if (lines[index]?.startsWith("## ")) {
      sectionEnd = index;
      break;
    }
  }

  return { headingIndex, sectionEnd };
}

export function withRenderedContextSlice(body: string, rendered: string): string {
  const lines = body.split("\n");
  const bounds = contextSliceBounds(lines);
  if (bounds === undefined) {
    const separator = body === "" || body.endsWith("\n\n") ? "" : "\n";
    return `${body}${separator}${CONTEXT_HEADING}\n\n${rendered}\n`;
  }

  return [
    ...lines.slice(0, bounds.headingIndex + 1),
    "",
    rendered,
    "",
    ...lines.slice(bounds.sectionEnd),
  ].join("\n");
}

export function contextSliceOf(body: string): string {
  const slice = contextSlice(body);
  return slice.kind === "present" ? slice.body : "";
}

export function contextSlice(body: string): ContextSlice {
  const lines = body.split("\n");
  const bounds = contextSliceBounds(lines);
  if (bounds === undefined) return { kind: "absent" };

  return {
    kind: "present",
    body: lines.slice(bounds.headingIndex + 1, bounds.sectionEnd).join("\n"),
  };
}

const CONTEXT_HEADING = "## Context slice";

// Replaces whatever prose sits under "## Context slice" with the rendered slice, leaving every
// other section of the body untouched. The brief's front matter substrate.address never changes
// here: it is composed once, outside the runner, and the runner's own view of the address comes
// only from .interlock/local.yaml, never committed.
export function withRenderedContextSlice(
  body: string,
  rendered: string,
): string {
  const lines = body.split("\n");
  const headingIndex = lines.findIndex(
    (line) => line.trim() === CONTEXT_HEADING,
  );
  if (headingIndex === -1) return body;

  let sectionEnd = lines.length;
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    if (lines[index]?.startsWith("## ")) {
      sectionEnd = index;
      break;
    }
  }

  return [
    ...lines.slice(0, headingIndex + 1),
    "",
    rendered,
    "",
    ...lines.slice(sectionEnd),
  ].join("\n");
}

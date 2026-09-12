const CONTEXT_HEADING = "## Context slice";

export function withRenderedContextSlice(body: string, rendered: string): string {
  const lines = body.split("\n");
  const headingIndex = lines.findIndex((line) => line.trim() === CONTEXT_HEADING);
  if (headingIndex === -1) return body;

  let sectionEnd = lines.length;
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    if (lines[index]?.startsWith("## ")) {
      sectionEnd = index;
      break;
    }
  }

  return [...lines.slice(0, headingIndex + 1), "", rendered, "", ...lines.slice(sectionEnd)].join(
    "\n",
  );
}

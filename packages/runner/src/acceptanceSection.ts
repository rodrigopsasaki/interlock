export const ACCEPTANCE_TITLE = "Acceptance (verbatim from the graph)";

const ACCEPTANCE_HEADING = `## ${ACCEPTANCE_TITLE}`;

const GENERATED_MARKER = "<!-- interlock:";

export type AcceptanceReconciliation =
  | { readonly kind: "retained"; readonly body: string }
  | { readonly kind: "replaced"; readonly body: string }
  | { readonly kind: "added"; readonly body: string };

interface BodyLine {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

interface AcceptanceSectionBounds {
  readonly headingEnd: number;
  readonly sectionEnd: number;
  readonly lines: readonly string[];
}

function bodyLines(body: string): readonly BodyLine[] {
  const lines: BodyLine[] = [];
  let start = 0;
  while (start < body.length) {
    const newline = body.indexOf("\n", start);
    const textEnd = newline === -1 ? body.length : newline;
    lines.push({
      text: body.slice(start, textEnd).replace(/\r$/, ""),
      start,
      end: newline === -1 ? body.length : newline + 1,
    });
    start = newline === -1 ? body.length : newline + 1;
  }
  return lines;
}

function isAcceptanceHeading(line: string): boolean {
  return line.trim() === ACCEPTANCE_HEADING;
}

function endsSection(line: string): boolean {
  return /^#{1,2}\s/.test(line) || line.startsWith(GENERATED_MARKER);
}

function acceptanceSectionBounds(body: string): AcceptanceSectionBounds | undefined {
  let heading: BodyLine | undefined;
  let sectionEnd = body.length;
  const lines: string[] = [];
  for (const line of bodyLines(body)) {
    if (heading === undefined) {
      if (isAcceptanceHeading(line.text)) heading = line;
      continue;
    }
    if (endsSection(line.text)) {
      sectionEnd = line.start;
      break;
    }
    lines.push(line.text);
  }
  if (heading === undefined) return undefined;
  return { headingEnd: heading.end, sectionEnd, lines };
}

export function hasAcceptanceSection(body: string): boolean {
  return acceptanceSectionBounds(body) !== undefined;
}

function isSectionPadding(line: string): boolean {
  return line.trim() === "";
}

function withoutSectionPadding(lines: readonly string[]): readonly string[] {
  let first = 0;
  let last = lines.length;
  while (first < last && isSectionPadding(lines[first] ?? "")) first += 1;
  while (last > first && isSectionPadding(lines[last - 1] ?? "")) last -= 1;
  return lines.slice(first, last);
}

function unquoted(line: string): string {
  if (!line.startsWith(">")) return line;
  const afterMarker = line.slice(1);
  return afterMarker.startsWith(" ") ? afterMarker.slice(1) : afterMarker;
}

function quotedAcceptanceText(lines: readonly string[]): string {
  return withoutSectionPadding(lines).map(unquoted).join("\n");
}

function normalizedAcceptance(acceptance: string): string {
  const lineFeeds = acceptance.replace(/\r\n?/g, "\n");
  return lineFeeds.endsWith("\n") ? lineFeeds.slice(0, -1) : lineFeeds;
}

function quoted(acceptance: string): string {
  const text = normalizedAcceptance(acceptance);
  if (text === "") return "\n";
  const lines = text.split("\n").map((line) => (line === "" ? ">" : `> ${line}`));
  return `\n${lines.join("\n")}\n`;
}

export function renderAcceptanceSection(acceptance: string): string {
  return `${ACCEPTANCE_HEADING}\n${quoted(acceptance)}`;
}

export function reconcileAcceptanceSection(
  body: string,
  acceptance: string,
): AcceptanceReconciliation {
  const bounds = acceptanceSectionBounds(body);
  if (bounds === undefined) {
    const separator =
      body === "" || body.endsWith("\n\n") ? "" : body.endsWith("\n") ? "\n" : "\n\n";
    return { kind: "added", body: `${body}${separator}${renderAcceptanceSection(acceptance)}` };
  }
  if (quotedAcceptanceText(bounds.lines) === normalizedAcceptance(acceptance)) {
    return { kind: "retained", body };
  }
  const before = body.slice(0, bounds.headingEnd);
  const after = body.slice(bounds.sectionEnd);
  const headingBreak = before.endsWith("\n") ? "" : "\n";
  const trailingPadding = after === "" ? "" : "\n";
  return {
    kind: "replaced",
    body: `${before}${headingBreak}${quoted(acceptance)}${trailingPadding}${after}`,
  };
}

export function narrateAcceptance(
  node: string,
  reconciliation: AcceptanceReconciliation,
): readonly string[] {
  switch (reconciliation.kind) {
    case "retained":
      return [];
    case "replaced":
      return [
        `acceptance: the repository copy's acceptance for node ${node} differs from the graph's; overwritten.`,
      ];
    case "added":
      return [
        `acceptance: the repository copy has no acceptance section for node ${node}; the runner added the graph's.`,
      ];
  }
}

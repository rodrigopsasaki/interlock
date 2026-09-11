const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?([\s\S]*)$/;

export function splitFrontMatter(content: string): string | undefined {
  return FRONT_MATTER.exec(content)?.[1];
}

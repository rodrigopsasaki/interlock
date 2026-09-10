export function isPlainWord(value: string): boolean {
  return value.length > 0 && !/\s/.test(value);
}

export function isShaLike(value: string): boolean {
  return /^[0-9a-f]{40}$/i.test(value);
}

const AGENT_NAME_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

export const AGENT_NAME_SHAPE_DESCRIPTION =
  'a lowercase letter followed by up to 31 lowercase letters, digits, "_" or "-"';

export function isCompliantAgentName(name: string): boolean {
  return AGENT_NAME_PATTERN.test(name);
}

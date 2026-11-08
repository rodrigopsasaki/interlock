import { err, ok, type Result } from "@phyxiusjs/fp";

export const WRITABLE_ROOT_PLACEHOLDER = "{path}";
export const PROBE_COMMAND_PLACEHOLDER = "{command}";

export interface WritableRootTemplate {
  readonly before: readonly string[];
  readonly after: readonly string[];
}

export function parseWritableRootArgs(
  value: unknown,
  fieldPath: string,
): Result<WritableRootTemplate | undefined, string> {
  if (value === undefined) return ok(undefined);
  if (!Array.isArray(value)) {
    return err(`"${fieldPath}" must be a list of strings`);
  }
  if (value.length === 0) {
    return err(
      `"${fieldPath}" must not be empty; it needs exactly one "${WRITABLE_ROOT_PLACEHOLDER}" element`,
    );
  }

  const elements: string[] = [];
  for (const [index, element] of value.entries()) {
    if (typeof element !== "string") {
      return err(`"${fieldPath}[${index}]" must be a string`);
    }
    if (element !== WRITABLE_ROOT_PLACEHOLDER && element.includes(WRITABLE_ROOT_PLACEHOLDER)) {
      return err(
        `"${fieldPath}[${index}]" embeds "${WRITABLE_ROOT_PLACEHOLDER}"; the placeholder must be a whole element`,
      );
    }
    elements.push(element);
  }

  const placeholders = elements.filter((element) => element === WRITABLE_ROOT_PLACEHOLDER);
  if (placeholders.length !== 1) {
    return err(
      `"${fieldPath}" must contain exactly one "${WRITABLE_ROOT_PLACEHOLDER}" element; found ${placeholders.length}`,
    );
  }

  const at = elements.indexOf(WRITABLE_ROOT_PLACEHOLDER);
  return ok({ before: elements.slice(0, at), after: elements.slice(at + 1) });
}

export function expandWritableRootArgs(
  template: WritableRootTemplate,
  path: string,
): readonly string[] {
  return [...template.before, path, ...template.after];
}

export function parseProbeExec(
  value: unknown,
  fieldPath: string,
): Result<WritableRootTemplate | undefined, string> {
  if (value === undefined) return ok(undefined);
  if (!Array.isArray(value)) return err(`"${fieldPath}" must be a list of strings`);
  if (value.length === 0) {
    return err(
      `"${fieldPath}" must not be empty; it needs exactly one "${PROBE_COMMAND_PLACEHOLDER}" element`,
    );
  }
  const elements: string[] = [];
  for (const [index, element] of value.entries()) {
    if (typeof element !== "string") return err(`"${fieldPath}[${index}]" must be a string`);
    if (element !== PROBE_COMMAND_PLACEHOLDER && element.includes(PROBE_COMMAND_PLACEHOLDER)) {
      return err(
        `"${fieldPath}[${index}]" embeds "${PROBE_COMMAND_PLACEHOLDER}"; the placeholder must be a whole element`,
      );
    }
    elements.push(element);
  }
  const placeholders = elements.filter((element) => element === PROBE_COMMAND_PLACEHOLDER);
  if (placeholders.length !== 1) {
    return err(
      `"${fieldPath}" must contain exactly one "${PROBE_COMMAND_PLACEHOLDER}" element; found ${placeholders.length}`,
    );
  }
  const at = elements.indexOf(PROBE_COMMAND_PLACEHOLDER);
  return ok({ before: elements.slice(0, at), after: elements.slice(at + 1) });
}

export function expandProbeExec(
  template: WritableRootTemplate,
  command: string,
): readonly string[] {
  return [...template.before, command, ...template.after];
}

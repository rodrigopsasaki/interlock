import { err, ok, type Result } from "@phyxiusjs/fp";

export const WRITABLE_ROOT_PLACEHOLDER = "{path}";
export const PROBE_COMMAND_PLACEHOLDER = "{command}";

export interface WritableRootTemplate {
  readonly before: readonly string[];
  readonly after: readonly string[];
}

export function parseArgumentTemplate(
  value: unknown,
  fieldPath: string,
  placeholder: string,
): Result<WritableRootTemplate | undefined, string> {
  if (value === undefined) return ok(undefined);
  if (!Array.isArray(value)) {
    return err(`"${fieldPath}" must be a list of strings`);
  }
  if (value.length === 0) {
    return err(`"${fieldPath}" must not be empty; it needs exactly one "${placeholder}" element`);
  }

  const elements: string[] = [];
  for (const [index, element] of value.entries()) {
    if (typeof element !== "string") {
      return err(`"${fieldPath}[${index}]" must be a string`);
    }
    if (element !== placeholder && element.includes(placeholder)) {
      return err(
        `"${fieldPath}[${index}]" embeds "${placeholder}"; the placeholder must be a whole element`,
      );
    }
    elements.push(element);
  }

  const placeholders = elements.filter((element) => element === placeholder);
  if (placeholders.length !== 1) {
    return err(
      `"${fieldPath}" must contain exactly one "${placeholder}" element; found ${placeholders.length}`,
    );
  }

  const at = elements.indexOf(placeholder);
  return ok({ before: elements.slice(0, at), after: elements.slice(at + 1) });
}

export function parseWritableRootArgs(
  value: unknown,
  fieldPath: string,
): Result<WritableRootTemplate | undefined, string> {
  return parseArgumentTemplate(value, fieldPath, WRITABLE_ROOT_PLACEHOLDER);
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
  return parseArgumentTemplate(value, fieldPath, PROBE_COMMAND_PLACEHOLDER);
}

export function expandProbeExec(
  template: WritableRootTemplate,
  command: string,
): readonly string[] {
  return [...template.before, command, ...template.after];
}

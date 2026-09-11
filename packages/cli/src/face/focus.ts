import { isErr, ok, type Result } from "@phyxiusjs/fp";
import type { AgentIdentityQuery, Runtime, RuntimeRefusal } from "runner";

export async function focusSession(
  runtime: Runtime,
  query: AgentIdentityQuery,
): Promise<Result<boolean, RuntimeRefusal>> {
  if (runtime.resolvePane === undefined || runtime.focusPane === undefined) {
    return ok(false);
  }
  const pane = await runtime.resolvePane(query);
  if (isErr(pane)) return pane;
  if (pane.value === undefined) return ok(false);
  const focused = await runtime.focusPane(pane.value);
  return isErr(focused) ? focused : ok(true);
}

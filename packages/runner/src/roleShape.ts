import type { RoleEntry, RoleTable } from "debrief";
import { type NodeRole, type Walk, walkFor } from "ledger";

export interface RoleShape {
  readonly role: NodeRole;
  readonly entry: RoleEntry;
  readonly walk: Walk;
}

export function roleShapeFor(role: NodeRole, table: RoleTable, address: string): RoleShape {
  const entry = table[role];
  return { role, entry, walk: walkFor(address, entry.walk) };
}

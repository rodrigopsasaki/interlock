import { err, ok, type Result } from "@phyxiusjs/fp";
import { isNode, type Node } from "./graph.ts";
import { isRecord, isString, prop } from "./validate.ts";

export interface Lease {
  readonly node: Node;
  readonly session: string;
  readonly expiry: number;
}

export function createLease(
  node: Node,
  session: string,
  expiry: number,
): Lease {
  return { node, session, expiry };
}

export interface LeaseRefusal {
  readonly kind: "would-shorten";
  readonly current: number;
  readonly proposed: number;
}

export function renewLease(
  lease: Lease,
  nextExpiry: number,
): Result<Lease, LeaseRefusal> {
  if (nextExpiry <= lease.expiry) {
    return err({
      kind: "would-shorten",
      current: lease.expiry,
      proposed: nextExpiry,
    });
  }
  return ok({ ...lease, expiry: nextExpiry });
}

export function isLease(value: unknown): value is Lease {
  return (
    isRecord(value) &&
    isNode(prop(value, "node")) &&
    isString(prop(value, "session")) &&
    typeof prop(value, "expiry") === "number"
  );
}

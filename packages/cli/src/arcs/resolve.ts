import type { Result } from "@phyxiusjs/fp";
import { err, isErr, ok } from "@phyxiusjs/fp";
import type { GraphDocument } from "face";
import type { Arc, ArcRegistry } from "./reader.ts";

export type ArcReading = "admission" | "history";

export interface AdmittedGraph {
  readonly document: GraphDocument;
  readonly arc: Arc;
}

function referenceWithoutNote(reference: string): string {
  return reference.replace(/\s+\([^()]*\)$/, "");
}

function graphReference(registry: ArcRegistry, graph: string): string {
  return `${registry.repository}/${graph}`;
}

function arcForId(registry: ArcRegistry, id: string): Arc | undefined {
  return registry.arcs.find((arc) => arc.id === id);
}

function ownersOf(registry: ArcRegistry, reference: string): readonly Arc[] {
  return registry.arcs.filter((arc) =>
    arc.graphs.some((graph) => referenceWithoutNote(graph) === reference),
  );
}

function supersedingArc(registry: ArcRegistry, reference: string):
  | { readonly arc: Arc; readonly because: string }
  | undefined {
  for (const arc of registry.arcs) {
    const entry = arc.superseded.find((candidate) => referenceWithoutNote(candidate.graph) === reference);
    if (entry !== undefined) return { arc, because: entry.because };
  }
  return undefined;
}

function noArcReason(graph: GraphDocument, detail: string): string {
  return `${graph.id} has no arc: ${detail}`;
}

export function resolveGraphArc(
  registry: ArcRegistry,
  graph: GraphDocument,
  reading: ArcReading,
): Result<Arc, string> {
  const reference = graphReference(registry, graph.id);
  const owners = ownersOf(registry, reference);
  if (owners.length > 1) {
    const names = owners.map((arc) => arc.id).join(" and ");
    return err(noArcReason(graph, `arcs.yaml lists it under two arcs, ${names}`));
  }

  const key = graph.arc;
  const keyedArc = key === undefined ? undefined : arcForId(registry, key);
  if (key !== undefined && keyedArc === undefined) {
    return err(noArcReason(graph, `its arc key names ${key}, which arcs.yaml does not hold`));
  }

  const owner = owners[0];
  if (owner !== undefined && keyedArc !== undefined && owner.id !== keyedArc.id) {
    return err(noArcReason(graph, `its arc key says ${key}, but arcs.yaml lists it under ${owner.id}`));
  }

  const superseded = supersedingArc(registry, reference);
  if (owner === undefined && keyedArc === undefined && superseded !== undefined) {
    if (reading === "admission") {
      return err(noArcReason(graph, `it was superseded in arc ${superseded.arc.id}: ${superseded.because}`));
    }
    return ok(superseded.arc);
  }

  const resolved = keyedArc ?? owner;
  if (resolved !== undefined) return ok(resolved);
  return err(
    noArcReason(graph, `no arc in .interlock/arcs.yaml lists ${reference}, and the graph carries no arc key`),
  );
}

export function admitGraph(
  registry: ArcRegistry,
  document: GraphDocument,
): Result<AdmittedGraph, string> {
  const arc = resolveGraphArc(registry, document, "admission");
  return isErr(arc) ? err(arc.error) : ok({ document, arc: arc.value });
}

export function resolveGraphHistory(
  registry: ArcRegistry,
  document: GraphDocument,
): Result<Arc, string> {
  return resolveGraphArc(registry, document, "history");
}

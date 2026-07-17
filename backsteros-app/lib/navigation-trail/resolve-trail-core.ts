import { getNavigationTrailAncestorHref } from "./codec";
import type { ResolvedNavigationTrailEntity } from "./resolved-entity";
import type {
  NavigationTrail,
  NavigationTrailEntityRef,
  ResolvedNavigationTrailItem,
} from "./types";

export type ResolveNavigationTrailEntityFn = (
  ref: NavigationTrailEntityRef,
) =>
  | ResolvedNavigationTrailEntity
  | null
  | Promise<ResolvedNavigationTrailEntity | null>;

export function resolveNavigationTrailCoreSync(
  trail: NavigationTrail,
  resolveEntity: (
    ref: NavigationTrailEntityRef,
  ) => ResolvedNavigationTrailEntity | null,
): {
  trail: NavigationTrail;
  items: ResolvedNavigationTrailItem[];
  target: ResolvedNavigationTrailEntity;
} | null {
  const resolvedNodes = trail.nodes.map((node) => resolveEntity(node));
  if (resolvedNodes.some((entry) => !entry)) {
    return null;
  }

  const entities = resolvedNodes as ResolvedNavigationTrailEntity[];
  const canonicalTrail: NavigationTrail = {
    sourceHref: trail.sourceHref,
    nodes: entities.map((entry) => entry.ref),
  };
  const items = entities.map((entry, index) => ({
    ref: entry.ref,
    label: entry.label,
    href: getNavigationTrailAncestorHref(canonicalTrail, index),
  }));

  return {
    trail: canonicalTrail,
    items,
    target: entities[entities.length - 1]!,
  };
}

export async function resolveNavigationTrailCore(
  trail: NavigationTrail,
  resolveEntity: ResolveNavigationTrailEntityFn,
): Promise<{
  trail: NavigationTrail;
  items: ResolvedNavigationTrailItem[];
  target: ResolvedNavigationTrailEntity;
} | null> {
  const resolvedNodes = await Promise.all(
    trail.nodes.map((node) => Promise.resolve(resolveEntity(node))),
  );
  if (resolvedNodes.some((entry) => !entry)) {
    return null;
  }

  const entities = resolvedNodes as ResolvedNavigationTrailEntity[];
  const canonicalTrail: NavigationTrail = {
    sourceHref: trail.sourceHref,
    nodes: entities.map((entry) => entry.ref),
  };
  const items = entities.map((entry, index) => ({
    ref: entry.ref,
    label: entry.label,
    href: getNavigationTrailAncestorHref(canonicalTrail, index),
  }));

  return {
    trail: canonicalTrail,
    items,
    target: entities[entities.length - 1]!,
  };
}

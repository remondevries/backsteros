import {
  NAVIGATION_TRAIL_KINDS,
  type NavigationTrail,
  type NavigationTrailEntityRef,
  type NavigationTrailKind,
} from "./types";
import { isValidInternalPath } from "./path-utils";
import { isEntityRouteUuid } from "@/lib/entity-slugs";

const TRAIL_MARKER_PREFIX = "~";

function isTrailKind(value: string): value is NavigationTrailKind {
  return NAVIGATION_TRAIL_KINDS.includes(value as NavigationTrailKind);
}

function decodeSegment(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value).trim();
    return decoded && !decoded.includes("/") ? decoded : null;
  } catch {
    return null;
  }
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

function getMarkerKind(segment: string): NavigationTrailKind | null {
  if (!segment.startsWith(TRAIL_MARKER_PREFIX)) {
    return null;
  }

  const kind = segment.slice(TRAIL_MARKER_PREFIX.length);
  return isTrailKind(kind) ? kind : null;
}

function parseIdentityPayload(value: string): {
  displayValue: string;
  entityId?: string;
} {
  const separatorIndex = value.lastIndexOf("~");
  if (separatorIndex <= 0) {
    return { displayValue: value };
  }
  const possibleId = value.slice(separatorIndex + 1);
  return isEntityRouteUuid(possibleId)
    ? {
        displayValue: value.slice(0, separatorIndex),
        entityId: possibleId,
      }
    : { displayValue: value };
}

function parseNode(
  kind: NavigationTrailKind,
  segments: string[],
  startIndex: number,
): { node: NavigationTrailEntityRef; nextIndex: number } | null {
  if (kind === "document") {
    const firstPayload = decodeSegment(segments[startIndex] ?? "");
    if (!firstPayload) {
      return null;
    }
    const firstIdentity = parseIdentityPayload(firstPayload);
    if (firstIdentity.entityId) {
      return {
        node: {
          kind,
          projectRouteParam: "",
          relativePath: firstIdentity.displayValue,
          entityId: firstIdentity.entityId,
        },
        nextIndex: startIndex + 1,
      };
    }
    const projectRouteParam = firstPayload;

    const relativeSegments: string[] = [];
    let index = startIndex + 1;
    while (index < segments.length && !getMarkerKind(segments[index]!)) {
      const decoded = decodeSegment(segments[index]!);
      if (!decoded) {
        return null;
      }
      relativeSegments.push(decoded);
      index += 1;
    }

    if (relativeSegments.length === 0) {
      return null;
    }

    const identity = parseIdentityPayload(relativeSegments.at(-1)!);
    if (identity.entityId) {
      return {
        node: {
          kind,
          projectRouteParam: "",
          relativePath: identity.displayValue,
          entityId: identity.entityId,
        },
        nextIndex: index,
      };
    }

    return {
      node: {
        kind,
        projectRouteParam,
        relativePath: relativeSegments.join("/"),
      },
      nextIndex: index,
    };
  }

  const routeParam = decodeSegment(segments[startIndex] ?? "");
  if (!routeParam) {
    return null;
  }
  const identity = parseIdentityPayload(routeParam);

  return {
    node: {
      kind,
      routeParam: identity.displayValue,
      ...(identity.entityId ? { entityId: identity.entityId } : {}),
    } as NavigationTrailEntityRef,
    nextIndex: startIndex + 1,
  };
}

export function parseNavigationTrailPath(pathname: string): NavigationTrail | null {
  if (!isValidInternalPath(pathname)) {
    return null;
  }

  const parsedUrl = new URL(pathname, "http://internal");
  const pathOnly = parsedUrl.pathname;
  const segments = pathOnly.split("/").filter(Boolean);
  const firstMarkerIndex = segments.findIndex((segment) => getMarkerKind(segment));
  if (firstMarkerIndex < 0) {
    return null;
  }

  const sourceSegments = segments.slice(0, firstMarkerIndex);
  if (sourceSegments.length === 0) {
    return null;
  }

  const sourceHref = `/${sourceSegments.join("/")}${parsedUrl.search}${parsedUrl.hash}`;
  const nodes: NavigationTrailEntityRef[] = [];
  let index = firstMarkerIndex;

  while (index < segments.length) {
    const kind = getMarkerKind(segments[index]!);
    if (!kind) {
      return null;
    }

    const parsed = parseNode(kind, segments, index + 1);
    if (!parsed) {
      return null;
    }

    nodes.push(parsed.node);
    index = parsed.nextIndex;
  }

  return nodes.length > 0 ? { sourceHref, nodes } : null;
}

export function encodeNavigationTrailNode(
  ref: NavigationTrailEntityRef,
): string {
  const marker = `${TRAIL_MARKER_PREFIX}${ref.kind}`;
  if (ref.kind === "document") {
    if (ref.entityId) {
      const displaySlug = ref.relativePath.split("/").filter(Boolean).at(-1);
      return displaySlug
        ? `${marker}/${encodeSegment(`${displaySlug}~${ref.entityId}`)}`
        : marker;
    }
    const relativePath = ref.relativePath
      .split("/")
      .filter(Boolean)
      .map(encodeSegment)
      .join("/");
    return `${marker}/${encodeSegment(ref.projectRouteParam)}/${relativePath}`;
  }

  const payload = ref.entityId
    ? `${ref.routeParam}~${ref.entityId}`
    : ref.routeParam;
  return `${marker}/${encodeSegment(payload)}`;
}

export function buildNavigationTrailHref(trail: NavigationTrail): string {
  const sourceUrl = new URL(trail.sourceHref, "http://internal");
  const sourcePathname = sourceUrl.pathname.replace(/\/+$/, "") || "/";
  const encodedNodes = trail.nodes.map(encodeNavigationTrailNode).join("/");
  return `${sourcePathname}/${encodedNodes}${sourceUrl.search}${sourceUrl.hash}`;
}

export function appendNavigationTrailNode(
  currentHref: string,
  ref: NavigationTrailEntityRef,
): string {
  const existing = parseNavigationTrailPath(currentHref);
  return buildNavigationTrailHref({
    sourceHref: existing?.sourceHref ?? currentHref,
    nodes: [...(existing?.nodes ?? []), ref],
  });
}

export function getNavigationTrailAncestorHref(
  trail: NavigationTrail,
  nodeIndex: number,
): string {
  if (nodeIndex < 0) {
    return trail.sourceHref;
  }

  return buildNavigationTrailHref({
    sourceHref: trail.sourceHref,
    nodes: trail.nodes.slice(0, nodeIndex + 1),
  });
}

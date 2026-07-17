export const NAVIGATION_TRAIL_KINDS = [
  "organization",
  "project",
  "contact",
  "task",
  "letter",
  "document",
] as const;

export type NavigationTrailKind = (typeof NAVIGATION_TRAIL_KINDS)[number];

export type NavigationTrailEntityRef =
  | { kind: "organization"; routeParam: string; entityId?: string }
  | { kind: "project"; routeParam: string; entityId?: string }
  | { kind: "contact"; routeParam: string; entityId?: string }
  | { kind: "task"; routeParam: string; entityId?: string }
  | { kind: "letter"; routeParam: string; entityId?: string }
  | {
      kind: "document";
      projectRouteParam: string;
      relativePath: string;
      entityId?: string;
    };

export type NavigationTrail = {
  sourceHref: string;
  nodes: NavigationTrailEntityRef[];
};

export type ResolvedNavigationTrailItem = {
  ref: NavigationTrailEntityRef;
  label: string;
  href: string;
};

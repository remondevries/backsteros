import type { NavigationTrailEntityRef } from "./types";

export type ResolvedNavigationTrailEntity = {
  ref: NavigationTrailEntityRef;
  canonicalHref: string;
  label: string;
};

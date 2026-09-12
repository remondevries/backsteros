import type { PendingPageSurface } from "./pending-navigation-routes";
import {
  KEEP_ALIVE_SURFACES,
  keepAliveSidePanelSurface,
} from "./shell-warm-keep-alive";

/** Keep-alive list surfaces, or remount-on-purpose live dests. */
export type LeftSidePanelDest = PendingPageSurface | "finance";

/**
 * One resolver: location → left panel destination.
 * Warm set comes from KEEP_ALIVE_SURFACES; finance stays remount-live.
 */
export function resolveLeftSidePanelDest(input: {
  pathname: string;
  search?: string;
  inInboxPanel: boolean;
  inCommunicationPanel?: boolean;
  financeSection: boolean;
  showSidePanel: boolean;
}): LeftSidePanelDest | null {
  if (input.inInboxPanel) return "inbox";
  if (input.inCommunicationPanel) return "communication";
  if (input.financeSection && input.showSidePanel) return "finance";
  if (!input.showSidePanel) return null;
  const surface = keepAliveSidePanelSurface(input.pathname);
  if (surface == null) return null;
  if (!KEEP_ALIVE_SURFACES.has(surface)) return null;
  return surface;
}

export function isKeepAliveLeftSidePanelDest(
  dest: LeftSidePanelDest | null,
): dest is PendingPageSurface {
  return dest != null && dest !== "finance" && KEEP_ALIVE_SURFACES.has(dest);
}

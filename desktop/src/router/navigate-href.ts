import type { NavigateOptions } from "@tanstack/react-router";

import {
  formatResolvedAppHref,
  resolveAppHref,
} from "../lib/resolve-app-href";
import { rememberProjectNavFromHref } from "../lib/project-type-cache";
import { rememberSectionEntryFromNav } from "../lib/section-entry-store";
import {
  dismissKeepAliveForOutletNavigation,
  rememberInboxPanelSelectionHref,
  tryWarmKeepAliveFlip,
} from "../lib/shell-warm-keep-alive";

type AppNavigate = (options: NavigateOptions) => void;

export function parseAppHref(href: string): {
  pathname: string;
  search?: Record<string, string>;
  hash?: string;
} {
  const hashIndex = href.indexOf("#");
  const withoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : undefined;
  const queryIndex = withoutHash.indexOf("?");
  const pathname =
    queryIndex >= 0
      ? withoutHash.slice(0, queryIndex) || "/"
      : withoutHash || "/";
  const searchPart = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "";
  const search = searchPart
    ? Object.fromEntries(new URLSearchParams(searchPart).entries())
    : undefined;
  return {
    pathname,
    ...(search ? { search } : {}),
    ...(hash ? { hash } : {}),
  };
}

/** Navigate via an app href string (`/tasks?due=today`) — Phase 5c helper. */
export function navigateToHref(
  navigate: AppNavigate,
  href: string,
  options?: { replace?: boolean; state?: unknown },
): void {
  const target = formatResolvedAppHref(resolveAppHref(href));
  // Warm flips skip TanStack state — cache nav-from so Development/Areas stay highlighted.
  rememberProjectNavFromHref(target, options?.state);
  if (tryWarmKeepAliveFlip(target, { replace: options?.replace })) {
    return;
  }
  rememberSectionEntryFromNav(target);
  rememberInboxPanelSelectionHref(target);
  dismissKeepAliveForOutletNavigation(target);
  const { pathname, search, hash } = parseAppHref(target);
  navigate({
    to: pathname as NavigateOptions["to"],
    search,
    hash,
    replace: options?.replace,
    ...(options?.state !== undefined
      ? { state: options.state as NavigateOptions["state"] }
      : {}),
  });
}

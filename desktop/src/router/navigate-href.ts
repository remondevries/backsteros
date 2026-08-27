import type { NavigateOptions } from "@tanstack/react-router";

import { expandNavigationHref } from "../lib/expand-navigation-href";
import { tryWarmKeepAliveFlip } from "../lib/shell-warm-keep-alive";

type AppNavigate = (options: NavigateOptions) => void;

function parseAppHref(href: string): {
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
  return { pathname, search, hash };
}

/** Navigate via an app href string (`/tasks?due=today`) — Phase 5c helper. */
export function navigateToHref(
  navigate: AppNavigate,
  href: string,
  options?: { replace?: boolean; state?: unknown },
): void {
  if (tryWarmKeepAliveFlip(href)) {
    return;
  }
  const target = expandNavigationHref(href);
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

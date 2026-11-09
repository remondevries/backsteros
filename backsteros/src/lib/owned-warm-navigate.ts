import type { NavigateOptions } from "@tanstack/react-router";

import { navigateToHref } from "../router/navigate-href";
import {
  captureWarmNavOwner,
  isWarmNavOwnerCurrent,
  type WarmNavOwner,
} from "./shell-warm-keep-alive";

type AppNavigate = (options: NavigateOptions) => void;

/**
 * Navigate only if the captured product-tab owner is still current.
 * Use at async/panel call sites so late Inbox A work cannot rewrite tab B.
 */
export function navigateToHrefIfWarmOwner(
  navigate: AppNavigate,
  href: string,
  owner: WarmNavOwner | null,
  options?: { replace?: boolean; state?: unknown },
): boolean {
  if (!isWarmNavOwnerCurrent(owner)) return false;
  navigateToHref(navigate, href, { ...options, owner });
  return true;
}

/** Capture owner then return a stable callback bound to that claim. */
export function createOwnedWarmNavigate(
  navigate: AppNavigate,
  options?: { replace?: boolean; state?: unknown },
): (href: string) => boolean {
  const owner = captureWarmNavOwner();
  return (href: string) =>
    navigateToHrefIfWarmOwner(navigate, href, owner, options);
}

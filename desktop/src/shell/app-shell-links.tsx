import {
  forwardRef,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Link } from "@tanstack/react-router";
import type { NavigateOptions } from "@tanstack/react-router";

import { type ClientLinkProps } from "@backsteros/ui";

import { formatResolvedAppHref, resolveAppHref } from "../lib/resolve-app-href";
import { preloadShellRouteChunkForHref } from "../lib/preload-shell-route-chunk";
import { parseAppHref } from "../router/navigate-href";
import { rememberSectionEntryFromNav } from "../lib/section-entry-store";
import {
  dismissKeepAliveForOutletNavigation,
  rememberInboxPanelSelectionHref,
  tryWarmKeepAliveFlip,
} from "../lib/shell-warm-keep-alive";

function isModifiedClick(
  event: KeyboardEvent | MouseEvent | PointerEvent<HTMLAnchorElement>,
): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function shouldHandleLinkActivation(
  event?: KeyboardEvent | MouseEvent | PointerEvent<HTMLAnchorElement>,
): boolean {
  if (event && "key" in event) {
    return event.key === "Enter" || event.key === " ";
  }
  if (event && "button" in event) {
    if (event.button !== 0) return false;
    if (isModifiedClick(event)) return false;
  }
  return true;
}

export function RouterLink({
  to,
  className,
  children,
  onClick,
  onDoubleClick,
  onMouseEnter,
  onFocus,
  onPointerDown,
  title,
  ...rest
}: {
  to: string;
  className?: string;
  children?: ReactNode;
  onClick?: (event?: MouseEvent<HTMLAnchorElement>) => void;
  onDoubleClick?: (event: MouseEvent) => void;
  onMouseEnter?: (event: MouseEvent<HTMLAnchorElement>) => void;
  onFocus?: (event: FocusEvent<HTMLAnchorElement>) => void;
  onPointerDown?: (event: PointerEvent<HTMLAnchorElement>) => void;
  title?: string;
  "aria-current"?: "page";
  "aria-label"?: string;
  [key: string]: unknown;
}) {
  const restKeyDown = rest.onKeyDown as
    | ((event: KeyboardEvent<HTMLAnchorElement>) => void)
    | undefined;
  const destination = formatResolvedAppHref(resolveAppHref(to));
  const { pathname, search, hash } = parseAppHref(destination);
  return (
    <Link
      to={pathname as NavigateOptions["to"]}
      search={search}
      hash={hash}
      className={className}
      title={title}
      aria-current={rest["aria-current"] as "page" | undefined}
      {...rest}
      onClick={(event) => {
        if (
          shouldHandleLinkActivation(event) &&
          tryWarmKeepAliveFlip(destination)
        ) {
          event.preventDefault();
          event.stopPropagation();
          event.nativeEvent.stopImmediatePropagation();
          return;
        }
        // Warm project open can leave the router on /development|/areas while
        // Projects keep-alive stays visible — dismiss so overview can show.
        // Do not preventDefault: TanStack still needs to move when the router
        // is on a different keep-alive path.
        rememberSectionEntryFromNav(destination);
        rememberInboxPanelSelectionHref(destination);
        dismissKeepAliveForOutletNavigation(destination);
        onClick?.(event);
      }}
      onDoubleClick={onDoubleClick}
      onMouseEnter={(event) => {
        preloadShellRouteChunkForHref(destination);
        onMouseEnter?.(event);
      }}
      onFocus={onFocus}
      onPointerDown={onPointerDown}
      onKeyDown={(event) => {
        if (event.key === " " && tryWarmKeepAliveFlip(destination)) {
          event.preventDefault();
          event.stopPropagation();
          event.nativeEvent.stopImmediatePropagation();
          return;
        }
        if (event.key === " ") {
          rememberSectionEntryFromNav(destination);
          rememberInboxPanelSelectionHref(destination);
          dismissKeepAliveForOutletNavigation(destination);
        }
        restKeyDown?.(event);
      }}
    >
      {children as never}
    </Link>
  );
}

export const DesktopClientLink = forwardRef<HTMLAnchorElement, ClientLinkProps>(
  function DesktopClientLink(
    { href, className, title, children, onClick, ...rest },
    ref,
  ) {
    const destination = formatResolvedAppHref(resolveAppHref(href));
    const { pathname, search, hash } = parseAppHref(destination);
    // Duplicate @types/react in the monorepo (Expo 19.0 vs desktop 19.1+) makes
    // React Router's Link props incompatible with AnchorHTMLAttributes — cast.
    return (
      <Link
        ref={ref}
        to={pathname as NavigateOptions["to"]}
        search={search}
        hash={hash}
        className={className}
        title={title}
        {...(rest as object)}
        onClick={(event) => {
          if (
            shouldHandleLinkActivation(event) &&
            tryWarmKeepAliveFlip(destination)
          ) {
            event.preventDefault();
            event.stopPropagation();
            event.nativeEvent.stopImmediatePropagation();
            return;
          }
          rememberSectionEntryFromNav(destination);
          rememberInboxPanelSelectionHref(destination);
          dismissKeepAliveForOutletNavigation(destination);
          onClick?.(event);
        }}
        onMouseEnter={() => {
          preloadShellRouteChunkForHref(destination);
        }}
      >
        {children as never}
      </Link>
    );
  },
);

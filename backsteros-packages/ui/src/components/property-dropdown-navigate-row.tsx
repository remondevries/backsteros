"use client";

import type { ReactNode } from "react";

import { ClientLink } from "../client-link.js";

export type PropertyDropdownNavigateRowProps = {
  children: ReactNode;
  navigateHref?: string | null;
  navigateLabel?: string;
  /** Hide the navigate affordance (e.g. mobile UI). */
  hideNavigate?: boolean;
};

/**
 * Wraps a property dropdown with an optional “Open” link (desktop web / Tauri).
 * Hosts pass `navigateHref` (and optionally `hideNavigate` for mobile).
 * Uses ClientLink so React Router / Next hosts get SPA navigation.
 */
export function PropertyDropdownNavigateRow({
  children,
  navigateHref,
  navigateLabel = "Open",
  hideNavigate = false,
}: PropertyDropdownNavigateRowProps) {
  const showNavigateLink = Boolean(navigateHref) && !hideNavigate;

  return (
    <div className="property-dropdown-navigate-row">
      <div className="property-dropdown-navigate-row__field">{children}</div>
      {showNavigateLink ? (
        <ClientLink
          href={navigateHref!}
          className="property-dropdown-navigate-row__link"
          aria-label={navigateLabel}
          title={navigateLabel}
        >
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path
              d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"
              fill="currentColor"
            />
          </svg>
        </ClientLink>
      ) : null}
    </div>
  );
}

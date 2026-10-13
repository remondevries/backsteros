"use client";

import { hasInboxUpdatedFlag } from "@backsteros/contracts";
import type { ReactNode } from "react";

export type IconWithInboxUpdateIndicatorProps = {
  inboxUpdatedAt?: Date | string | number | null;
  /** When set, takes precedence over `inboxUpdatedAt`. */
  inboxUpdated?: boolean;
  children: ReactNode;
  className?: string;
  title?: string;
};

/** Small green dot at the top-right of an icon when an item has unseen updates. */
export function IconWithInboxUpdateIndicator({
  inboxUpdatedAt,
  inboxUpdated,
  children,
  className = "",
  title = "Updated",
}: IconWithInboxUpdateIndicatorProps) {
  const show =
    inboxUpdated ?? hasInboxUpdatedFlag(inboxUpdatedAt);
  if (!show) return <>{children}</>;

  return (
    <span
      className={`icon-with-inbox-update${className ? ` ${className}` : ""}`}
      title={title}
    >
      {children}
      <span className="icon-with-inbox-update__dot" aria-hidden="true" />
    </span>
  );
}

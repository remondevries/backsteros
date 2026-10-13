"use client";

import { SyncIcon } from "@primer/octicons-react";

export type FinanceSyncIconProps = {
  size?: number;
  className?: string;
};

/** Finance sync/refresh glyph — matches the Recurrings side-nav icon. */
export function FinanceSyncIcon({
  size = 16,
  className,
}: FinanceSyncIconProps) {
  return <SyncIcon size={size} className={className} aria-hidden="true" />;
}

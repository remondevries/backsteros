"use client";

import type { ReactNode } from "react";

export function MobileListSearch() {
  return null;
}

export function MobileListSearchChrome({
  children,
}: {
  children?: ReactNode;
  title?: string;
  className?: string;
  searchPlaceholder?: string;
}) {
  return <>{children}</>;
}

"use client";
import type { ReactNode } from "react";
export function MobilePillTabShell({
  desktopFallback,
  children,
}: {
  title?: string;
  controls?: ReactNode;
  bodyMode?: string;
  desktopFallback?: ReactNode;
  children?: ReactNode;
}) {
  return <>{desktopFallback ?? children}</>;
}

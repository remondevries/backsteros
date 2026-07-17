"use client";
import type { ReactNode } from "react";
export function MobileFloatingPillToggleDock({ children }: { children?: ReactNode; className?: string; title?: string }) {
  return <div className="hidden">{children}</div>;
}

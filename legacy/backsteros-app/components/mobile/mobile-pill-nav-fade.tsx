"use client";
import type { ReactNode } from "react";
export function MobilePillNavFade({
  children,
  className,
  ...props
}: {
  children?: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return <div className={className} {...props}>{children}</div>;
}

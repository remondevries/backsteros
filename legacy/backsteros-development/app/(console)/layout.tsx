"use client";

import type { ReactNode } from "react";

import { ConsoleShell } from "@/components/console-shell";

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  // Single root avoids Next.js ClientSegmentRoot "missing key" warnings when a
  // client layout returns multiple fragment children.
  return (
    <div className="console-layout-root">
      <ConsoleShell />
      {children}
    </div>
  );
}

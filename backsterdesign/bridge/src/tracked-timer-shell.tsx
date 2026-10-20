import type { ReactNode } from "react";
import { TrackedTimerProvider } from "@backsteros/ui";

import { SyncRemoteRunningTimers } from "./sync-remote-running-timers.js";

/**
 * Shared timer context for Penpot bridge islands (tasks panel + pinned dock).
 * Each mount root gets its own provider; cross-island / cross-app sync goes
 * through cloud-core GET /api/v1/recent-timers (running-timers fallback).
 */
export function TrackedTimerShell({ children }: { children: ReactNode }) {
  return (
    <TrackedTimerProvider
      onNavigate={(href) => {
        if (!href.startsWith("/") || href.startsWith("//")) return;
        window.open(href, "_blank", "noopener");
      }}
    >
      <SyncRemoteRunningTimers />
      {children}
    </TrackedTimerProvider>
  );
}

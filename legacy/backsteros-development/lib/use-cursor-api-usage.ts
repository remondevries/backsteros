"use client";

import { useEffect, useState } from "react";

import {
  CURSOR_API_USAGE_EVENT,
  readCursorApiUsage,
  type CursorApiUsageSnapshot,
} from "@/lib/cursor-api-usage";

/** Live console Cursor API usage (localStorage + custom event). */
export function useCursorApiUsage(): CursorApiUsageSnapshot {
  const [usage, setUsage] = useState<CursorApiUsageSnapshot>(() =>
    readCursorApiUsage(),
  );

  useEffect(() => {
    function refresh() {
      setUsage(readCursorApiUsage());
    }
    refresh();
    window.addEventListener(CURSOR_API_USAGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CURSOR_API_USAGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return usage;
}

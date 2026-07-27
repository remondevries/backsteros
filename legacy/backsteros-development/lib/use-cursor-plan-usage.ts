"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { CursorPlanUsage } from "@/lib/cursor-plan-usage-shared";
import { CURSOR_API_USAGE_EVENT } from "@/lib/cursor-api-usage";

const POLL_MS = 5 * 60_000;

type PlanUsageState = {
  usage: CursorPlanUsage | null;
  loading: boolean;
  error: string | null;
};

const INITIAL: PlanUsageState = {
  usage: null,
  loading: true,
  error: null,
};

/** Poll Cursor subscription plan usage for the sidebar progress bars. */
export function useCursorPlanUsage(): PlanUsageState & {
  refresh: () => void;
} {
  const [state, setState] = useState<PlanUsageState>(INITIAL);
  const requestIdRef = useRef(0);

  const refresh = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setState((current) => ({
      ...current,
      loading: current.usage == null,
    }));
    void (async () => {
      try {
        const response = await fetch("/api/cursor-plan-usage", {
          cache: "no-store",
        });
        const json = (await response.json()) as {
          ok?: boolean;
          usage?: CursorPlanUsage | null;
          error?: string;
        };
        if (requestId !== requestIdRef.current) return;
        if (!response.ok || !json.ok || !json.usage) {
          setState({
            usage: null,
            loading: false,
            error: json.error ?? "unavailable",
          });
          return;
        }
        setState({ usage: json.usage, loading: false, error: null });
      } catch {
        if (requestId !== requestIdRef.current) return;
        setState({ usage: null, loading: false, error: "failed" });
      }
    })();
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    const onConsoleUsage = () => {
      refresh();
    };
    window.addEventListener(CURSOR_API_USAGE_EVENT, onConsoleUsage);
    return () => {
      requestIdRef.current += 1;
      window.clearInterval(timer);
      window.removeEventListener(CURSOR_API_USAGE_EVENT, onConsoleUsage);
    };
  }, [refresh]);

  return { ...state, refresh };
}

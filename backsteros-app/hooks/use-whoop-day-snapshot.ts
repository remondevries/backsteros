"use client";

import { useEffect, useMemo, useState } from "react";

import type { WhoopSnapshotEntity } from "@/lib/whoop/types";

type WhoopDayResponse = {
  authenticated?: boolean;
  snapshot?: WhoopSnapshotEntity | null;
};

export function useWhoopDaySnapshot(
  date: string | null,
  options?: { refreshKey?: number; enabled?: boolean },
) {
  const enabled = options?.enabled !== false && Boolean(date?.trim());
  const normalizedDate = date?.trim() || null;
  const fetchKey =
    enabled && normalizedDate
      ? `${normalizedDate}:${options?.refreshKey ?? 0}`
      : null;

  const [liveSnapshot, setLiveSnapshot] = useState<WhoopSnapshotEntity | null>(null);
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  const datedFallbackSnapshot = useMemo<WhoopSnapshotEntity | null>(() => {
    if (!normalizedDate) {
      return null;
    }
    return {
      id: `whoop-${normalizedDate}`,
      date: normalizedDate,
      sleepPerformance: null,
      recoveryScore: null,
      strainScore: null,
    };
  }, [normalizedDate]);

  const [prevFetchKey, setPrevFetchKey] = useState<string | null>(fetchKey);
  if (fetchKey !== prevFetchKey) {
    setPrevFetchKey(fetchKey);
    if (!fetchKey) {
      setLiveSnapshot(null);
      setLoading(false);
      setAuthenticated(null);
    } else {
      setLiveSnapshot(null);
      setLoading(true);
      setAuthenticated(null);
    }
  }

  useEffect(() => {
    if (!fetchKey || !normalizedDate) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(
          `/api/whoop/day?date=${encodeURIComponent(normalizedDate)}`,
          { cache: "no-store" },
        );
        const whoop = (await response.json()) as WhoopDayResponse;
        if (cancelled) {
          return;
        }
        setAuthenticated(Boolean(whoop.authenticated));
        setLiveSnapshot(whoop.snapshot ?? null);
      } catch {
        if (!cancelled) {
          setAuthenticated(false);
          setLiveSnapshot(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchKey, normalizedDate]);

  return {
    snapshot: liveSnapshot ?? datedFallbackSnapshot,
    loading,
    authenticated,
  };
}

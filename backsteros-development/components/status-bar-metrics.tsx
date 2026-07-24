"use client";

import { useEffect, useState, type ReactNode } from "react";

type SystemStats = {
  cpuPercent: number | null;
  memory: { total: number; used: number; free: number };
  disk: {
    path: string;
    total: number;
    used: number;
    free: number;
  } | null;
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 10 || unit === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value)}%`;
}

function usagePercent(used: number, total: number): number | null {
  if (!total) return null;
  return (used / total) * 100;
}

export function StatusBarMetrics({
  diskPath,
  leading,
}: {
  diskPath?: string | null;
  leading?: ReactNode;
}) {
  const [stats, setStats] = useState<SystemStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = { current: null as AbortController | null };

    const load = async () => {
      controller.current?.abort();
      const next = new AbortController();
      controller.current = next;
      try {
        const query = new URLSearchParams();
        if (diskPath) query.set("path", diskPath);
        const response = await fetch(
          `/api/system-stats${query.toString() ? `?${query}` : ""}`,
          { signal: next.signal, cache: "no-store" },
        );
        if (!response.ok) return;
        const data = (await response.json()) as SystemStats;
        if (!cancelled) setStats(data);
      } catch {
        /* aborted or offline */
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 2000);

    return () => {
      cancelled = true;
      controller.current?.abort();
      window.clearInterval(timer);
    };
  }, [diskPath]);

  if (!stats) {
    return (
      <div className="statusbar-metrics" aria-live="polite">
        {leading}
        <span className="statusbar-metric">CPU —</span>
        <span className="statusbar-metric">MEM —</span>
        <span className="statusbar-metric">Disk —</span>
      </div>
    );
  }

  const memPct = usagePercent(stats.memory.used, stats.memory.total);
  const diskPct = stats.disk
    ? usagePercent(stats.disk.used, stats.disk.total)
    : null;

  return (
    <div className="statusbar-metrics" aria-live="polite">
      {leading}
      <span
        className="statusbar-metric"
        title="System CPU usage (host machine)"
      >
        <span className="statusbar-metric-label">CPU</span>
        <span className="statusbar-metric-value">
          {formatPercent(stats.cpuPercent)}
        </span>
      </span>
      <span
        className="statusbar-metric"
        title={`Memory ${formatBytes(stats.memory.used)} used of ${formatBytes(stats.memory.total)} (app + wired + compressed)`}
      >
        <span className="statusbar-metric-label">MEM</span>
        <span className="statusbar-metric-value">
          {formatBytes(stats.memory.used)}
          <span className="statusbar-metric-sep">/</span>
          {formatBytes(stats.memory.total)}
          {memPct != null ? (
            <span className="statusbar-metric-pct">
              {" "}
              ({formatPercent(memPct)})
            </span>
          ) : null}
        </span>
      </span>
      <span
        className="statusbar-metric"
        title={
          stats.disk
            ? `Disk ${formatBytes(stats.disk.used)} used of ${formatBytes(stats.disk.total)} (${stats.disk.path})`
            : "Disk unavailable"
        }
      >
        <span className="statusbar-metric-label">Disk</span>
        <span className="statusbar-metric-value">
          {stats.disk ? (
            <>
              {formatBytes(stats.disk.used)}
              <span className="statusbar-metric-sep">/</span>
              {formatBytes(stats.disk.total)}
              {diskPct != null ? (
                <span className="statusbar-metric-pct">
                  {" "}
                  ({formatPercent(diskPct)})
                </span>
              ) : null}
            </>
          ) : (
            "—"
          )}
        </span>
      </span>
    </div>
  );
}

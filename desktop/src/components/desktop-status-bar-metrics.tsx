import { useEffect, useState, type ReactNode } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { invoke } from "../lib/tauri-invoke-instrumentation";

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

const SYSTEM_STATS_UPDATE_EVENT = "system-stats-update";

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

export function DesktopStatusBarMetrics({
  diskPath,
  leading,
}: {
  diskPath?: string | null;
  leading?: ReactNode;
}) {
  const [stats, setStats] = useState<SystemStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | undefined;

    const path = diskPath?.trim() || null;

    void (async () => {
      try {
        await invoke("set_system_stats_disk_path", { path });
      } catch {
        /* offline or permission */
      }

      try {
        const data = await invoke<SystemStats>("system_stats", { path });
        if (!cancelled) setStats(data);
      } catch {
        /* offline or permission */
      }

      try {
        unlisten = await listen<SystemStats>(SYSTEM_STATS_UPDATE_EVENT, (event) => {
          if (!cancelled) setStats(event.payload);
        });
      } catch {
        /* not in Tauri shell */
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [diskPath]);

  if (!stats) {
    return (
      <div className="statusbar-metrics" aria-live="polite">
        {leading}
        <span className="statusbar-metric statusbar-metric--cpu">
          <span className="statusbar-metric-label">CPU</span>
          <span className="statusbar-metric-value">—</span>
        </span>
        <span className="statusbar-metric statusbar-metric--mem">
          <span className="statusbar-metric-label">MEM</span>
          <span className="statusbar-metric-value">—</span>
        </span>
        <span className="statusbar-metric statusbar-metric--disk">
          <span className="statusbar-metric-label">Disk</span>
          <span className="statusbar-metric-value">—</span>
        </span>
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
        className="statusbar-metric statusbar-metric--cpu"
        title="System CPU usage (host machine)"
      >
        <span className="statusbar-metric-label">CPU</span>
        <span className="statusbar-metric-value">
          {formatPercent(stats.cpuPercent)}
        </span>
      </span>
      <span
        className="statusbar-metric statusbar-metric--mem"
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
        className="statusbar-metric statusbar-metric--disk"
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

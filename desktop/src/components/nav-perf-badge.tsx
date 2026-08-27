import { useSyncExternalStore } from "react";

import {
  getNavPerfEntries,
  subscribeNavPerf,
  type NavPerfEntry,
} from "../lib/nav-perf-probe";

/**
 * TEMPORARY on-screen readout of the last few keep-alive navigations. Shows
 * source → target, whether it warm-flipped, paint time, and main-thread
 * long-task time. Remove together with nav-perf-probe once slow hops are fixed.
 */
export function NavPerfBadge() {
  const entries = useSyncExternalStore(
    subscribeNavPerf,
    getNavPerfEntries,
    getNavPerfEntries,
  );
  if (entries.length === 0) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 8,
        right: 8,
        zIndex: 2147483647,
        pointerEvents: "none",
        maxWidth: 360,
        padding: "6px 8px",
        borderRadius: 6,
        background: "rgba(0,0,0,0.82)",
        color: "#e6edf3",
        font: "11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace",
        boxShadow: "0 2px 10px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ opacity: 0.6, marginBottom: 2 }}>nav perf (last {entries.length})</div>
      {entries.map((e, i) => (
        <NavPerfRow key={`${e.t}-${i}`} entry={e} highlight={i === 0} />
      ))}
    </div>
  );
}

function NavPerfRow({
  entry,
  highlight,
}: {
  entry: NavPerfEntry;
  highlight: boolean;
}) {
  const slow = entry.paintMs > 80 || entry.longTaskMs > 50;
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        opacity: highlight ? 1 : 0.72,
        color: slow ? "#ff7b72" : undefined,
      }}
    >
      <span style={{ minWidth: 150 }}>
        {(entry.from ?? "—")} → {entry.surface}
      </span>
      <span style={{ minWidth: 42 }}>{entry.flipped ? "flip" : "route"}</span>
      <span style={{ minWidth: 62, color: entry.panelToggled ? "#f0b72f" : undefined }}>
        {entry.panelToggled ? "PANEL±" : "panel="}
      </span>
      <span style={{ minWidth: 58 }}>paint {entry.paintMs}ms</span>
      <span>long {entry.longTaskMs}ms</span>
    </div>
  );
}

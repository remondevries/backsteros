/**
 * Polls ops sync-health for sync_events resync_needed and shows a clear shell
 * banner while local-core resets the cursor and bootstraps (OS-163).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useDesktopApi } from "../lib/api-context";
import { useDesktopPowerSync } from "../lib/powersync-context";
import { OPS_SYNC_HEALTH_PATH } from "../lib/replication-dead-letters";
import {
  IDLE_SYNC_EVENT_RESYNC,
  OPS_SYNC_EVENT_RESYNC_PATH,
  isSyncEventResyncActive,
  parseSyncEventResyncFacts,
  syncEventResyncDetail,
  syncEventResyncTitle,
  type SyncEventResyncFacts,
} from "../lib/sync-event-resync-client";

const POLL_MS = 5_000;

export function SyncEventResyncHost() {
  const { client } = useDesktopApi();
  const powerSync = useDesktopPowerSync();
  const [facts, setFacts] = useState<SyncEventResyncFacts>(IDLE_SYNC_EVENT_RESYNC);
  const [retrying, setRetrying] = useState(false);
  const prevStatus = useRef(facts.status);

  const refresh = useCallback(async () => {
    try {
      const body = await client.requestJson<unknown>(OPS_SYNC_HEALTH_PATH);
      setFacts(parseSyncEventResyncFacts(body));
    } catch {
      // Keep last known facts — transient health blips must not hide a resync.
    }
  }, [client]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await refresh();
    };
    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [refresh]);

  // After bootstrap finishes, reconnect PowerSync so SQLite picks up peer rows.
  useEffect(() => {
    const prev = prevStatus.current;
    prevStatus.current = facts.status;
    if (
      (prev === "bootstrapping" || prev === "needed" || prev === "failed") &&
      facts.status === "idle"
    ) {
      void powerSync.forceSync().catch((error: unknown) => {
        console.warn(
          "[desktop] PowerSync reconnect after sync-event resync failed",
          error,
        );
      });
    }
  }, [facts.status, powerSync]);

  const onRetry = useCallback(async () => {
    setRetrying(true);
    try {
      await client.requestJson(OPS_SYNC_EVENT_RESYNC_PATH, { method: "POST" });
      await refresh();
    } catch (error) {
      console.warn(
        "[desktop] sync-event resync retry failed",
        error instanceof Error ? error.message : error,
      );
    } finally {
      setRetrying(false);
    }
  }, [client, refresh]);

  if (!isSyncEventResyncActive(facts)) return null;

  return (
    <div
      className="sidebar-sync-conflict-prototype"
      role="status"
      aria-live="polite"
      data-sync-event-resync={facts.status}
    >
      <div className="sidebar-sync-conflict-prototype-title">
        {syncEventResyncTitle(facts.status)}
      </div>
      <div className="sidebar-sync-conflict-prototype-detail">
        {syncEventResyncDetail(facts)}
      </div>
      {(facts.status === "failed" || facts.status === "needed") && (
        <button
          type="button"
          className="sidebar-sync-conflict-prototype-action"
          disabled={retrying}
          onClick={() => {
            void onRetry();
          }}
        >
          {retrying ? "Starting…" : "Reload snapshot"}
        </button>
      )}
    </div>
  );
}

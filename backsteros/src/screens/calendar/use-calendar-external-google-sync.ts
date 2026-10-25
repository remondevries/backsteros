import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ExternalCalendarEvent,
  GoogleCalendarSettings,
  GoogleCalendarSyncResult,
} from "@backsteros/contracts";
import type { BacksterosApiClient } from "@backsteros/api-client";

const GOOGLE_CALENDAR_STALE_MS = 15 * 60_000;

/**
 * Google Calendar (and later CalDAV) read-only blocks for the calendar grid —
 * REST cache, not PowerSync. Also soft-pulls meetings on visit so agent/CLI
 * creates appear while PowerSync is disconnected.
 */
export function useCalendarExternalGoogleSync({
  client,
  active,
  frozen,
  softRefreshApiMeetings,
}: {
  client: BacksterosApiClient;
  active: boolean;
  frozen: boolean;
  softRefreshApiMeetings: () => Promise<void>;
}) {
  const [externalCalendarEvents, setExternalCalendarEvents] = useState<
    ExternalCalendarEvent[]
  >([]);
  const [calendarRefreshing, setCalendarRefreshing] = useState(false);
  /** Drops stale Google Calendar list responses when a newer refresh is in flight. */
  const refreshGenerationRef = useRef(0);

  // While PowerSync is connected, SSE liveMeetingsById + PowerSync download
  // are the live path (same as documents; avoid a full list GET on every visit).
  useEffect(() => {
    if (!active) return;
    void softRefreshApiMeetings().catch(() => {});
  }, [active, softRefreshApiMeetings]);

  const refreshExternalCalendarEvents = useCallback(
    async (options?: { forceSync?: boolean }) => {
      const generation = ++refreshGenerationRef.current;
      const isCurrent = () => generation === refreshGenerationRef.current;
      try {
        const settingsBody = await client.requestJson<GoogleCalendarSettings>(
          "/api/v1/settings/google-calendar",
        );
        if (!isCurrent()) return;
        if (!settingsBody.connected) {
          setExternalCalendarEvents([]);
          return;
        }
        const lastSynced = settingsBody.lastSyncedAt
          ? Date.parse(settingsBody.lastSyncedAt)
          : 0;
        const stale =
          !Number.isFinite(lastSynced) ||
          Date.now() - lastSynced > GOOGLE_CALENDAR_STALE_MS;
        if (options?.forceSync || stale) {
          // Sync failures must not skip the subsequent list — push/webhook may
          // already have fresher rows, and an older in-flight list must not win.
          try {
            await client.requestJson<GoogleCalendarSyncResult>(
              "/api/v1/settings/google-calendar/sync",
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: "{}",
              },
            );
          } catch (error) {
            if (options?.forceSync) {
              console.warn("[calendar] Google Calendar sync failed:", error);
            }
          }
          if (!isCurrent()) return;
        }
        const from = new Date();
        from.setDate(from.getDate() - 30);
        const to = new Date();
        to.setDate(to.getDate() + 90);
        const body = await client.requestJson<{
          events: ExternalCalendarEvent[];
        }>(
          `/api/v1/external-calendar-events?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
        );
        if (!isCurrent()) return;
        setExternalCalendarEvents(body.events ?? []);
      } catch (error) {
        if (options?.forceSync) {
          console.warn("[calendar] Google Calendar refresh failed:", error);
        }
        // Integration may be disabled or core offline — agenda still works.
      }
    },
    [client],
  );

  useEffect(() => {
    if (!active || frozen) return;
    void refreshExternalCalendarEvents();
  }, [active, frozen, refreshExternalCalendarEvents]);

  const handleCalendarRefresh = useCallback(() => {
    if (calendarRefreshing) return;
    setCalendarRefreshing(true);
    void (async () => {
      try {
        await Promise.all([
          softRefreshApiMeetings().catch(() => {}),
          refreshExternalCalendarEvents({ forceSync: true }),
        ]);
      } finally {
        setCalendarRefreshing(false);
      }
    })();
  }, [calendarRefreshing, refreshExternalCalendarEvents, softRefreshApiMeetings]);

  return {
    externalCalendarEvents,
    setExternalCalendarEvents,
    calendarRefreshing,
    refreshExternalCalendarEvents,
    handleCalendarRefresh,
  };
}

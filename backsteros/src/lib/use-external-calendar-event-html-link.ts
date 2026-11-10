import { useEffect, useState } from "react";

import type { ExternalCalendarEvent } from "@backsteros/contracts";

import { useDesktopApi } from "./api-context";

/**
 * Resolve a Google Calendar `htmlLink` for a linked external event id.
 * Prefer `initialHtmlLink` when the agenda already has the row in memory.
 */
export function useExternalCalendarEventHtmlLink(
  externalCalendarEventId: string | null | undefined,
  options?: {
    enabled?: boolean;
    initialHtmlLink?: string | null;
  },
): string | null {
  const { client } = useDesktopApi();
  const eventId = externalCalendarEventId?.trim() || null;
  const enabled = options?.enabled !== false && Boolean(eventId);
  const initial = options?.initialHtmlLink?.trim() || null;
  const [htmlLink, setHtmlLink] = useState<string | null>(initial);

  useEffect(() => {
    setHtmlLink(initial);
  }, [eventId, initial]);

  useEffect(() => {
    if (!enabled || !eventId || initial) return;

    let cancelled = false;
    void client
      .requestJson<ExternalCalendarEvent>(
        `/api/v1/external-calendar-events/${encodeURIComponent(eventId)}`,
      )
      .then((event) => {
        if (cancelled) return;
        setHtmlLink(event.htmlLink?.trim() || null);
      })
      .catch(() => {
        if (!cancelled) setHtmlLink(null);
      });

    return () => {
      cancelled = true;
    };
  }, [client, enabled, eventId, initial]);

  return htmlLink;
}

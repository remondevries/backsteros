import type { Document } from "@backsteros/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";

import { isPadDevice } from "../lib/device";
import { getTodayJournalDateSlug } from "../lib/journal";
import {
  TabStackHeader,
  TabStackHeaderPlusButton,
} from "../lib/tab-stack-options";
import { useLocalQuery } from "../lib/use-local-query";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { useRestFallbackGate } from "../lib/use-rest-fallback-gate";

type JournalDateRow = {
  id: string;
  journal_date: string;
};

const JOURNAL_DATES_SQL = `SELECT id, journal_date FROM documents
 WHERE deleted_at IS NULL
   AND type = 'journal'
   AND journal_date IS NOT NULL`;

type Props = {
  /** Fired after create-today fails (list can show the banner). */
  onCreateTodayError?: (message: string | null) => void;
};

/**
 * Journal list header — plus opens/creates today's entry when missing.
 */
export function JournalHeader({ onCreateTodayError }: Props = {}) {
  const router = useRouter();
  const client = useMobileApiClient();
  const isPad = isPadDevice();
  const todaySlug = getTodayJournalDateSlug();

  const { data: syncedRows } = useLocalQuery<JournalDateRow>(JOURNAL_DATES_SQL);
  const localRows = syncedRows ?? [];
  const useRest = useRestFallbackGate(localRows.length);

  const [restHasToday, setRestHasToday] = useState(false);
  const [isCreatingToday, setIsCreatingToday] = useState(false);

  useEffect(() => {
    if (!useRest) return;
    let cancelled = false;
    void (async () => {
      try {
        const body = await client.requestJson<{ documents: Document[] }>(
          "/api/v1/documents?type=journal",
        );
        if (cancelled) return;
        setRestHasToday(
          (body.documents ?? []).some(
            (document) => document.journalDate === todaySlug,
          ),
        );
      } catch {
        if (!cancelled) setRestHasToday(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, todaySlug, useRest]);

  const hasTodayEntry = useMemo(() => {
    if (localRows.some((row) => row.journal_date === todaySlug)) return true;
    if (useRest) return restHasToday;
    return false;
  }, [localRows, restHasToday, todaySlug, useRest]);

  const showCreateToday = !hasTodayEntry;

  const onCreateToday = useCallback(() => {
    if (isCreatingToday) return;
    setIsCreatingToday(true);
    onCreateTodayError?.(null);
    void (async () => {
      try {
        await client.requestJson(
          `/api/v1/journal/${encodeURIComponent(todaySlug)}`,
        );
        if (isPad) {
          router.replace(`/(app)/journal/${todaySlug}`);
        } else {
          router.push(`/(app)/journal/${todaySlug}`);
        }
      } catch (reason) {
        onCreateTodayError?.(
          reason instanceof Error
            ? reason.message
            : "Could not open today's journal.",
        );
      } finally {
        setIsCreatingToday(false);
      }
    })();
  }, [client, isCreatingToday, isPad, onCreateTodayError, router, todaySlug]);

  return (
    <TabStackHeader
      title="Journal"
      leadingActions={
        showCreateToday ? (
          <TabStackHeaderPlusButton
            onPress={onCreateToday}
            disabled={isCreatingToday}
            accessibilityLabel="Open today's journal"
          />
        ) : null
      }
    />
  );
}

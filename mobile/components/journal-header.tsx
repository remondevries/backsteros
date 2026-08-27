import type { Document } from "@backsteros/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";

import { isPadDevice } from "../lib/device";
import { getTodayJournalDateSlug } from "../lib/journal";
import { createTodayJournalViaPowerSyncOrApi } from "../lib/document-create";
import { PadSidePanelCollapseButton } from "../lib/pad-side-panel-collapse";
import { TabStackHeaderPlusButton } from "../lib/tab-stack-options";
import { useLocalQuery } from "../lib/use-local-query";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { useMobilePowerSync } from "../lib/powersync-context";
import { useRestFallbackGate } from "../lib/use-rest-fallback-gate";
import { SectionListHeader } from "./section-list-header";

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
  /** iPad: collapse the list side panel. */
  onToggleCollapse?: () => void;
};

/**
 * Journal list header — plus opens/creates today's entry when missing.
 */
export function JournalHeader({
  onCreateTodayError,
  onToggleCollapse,
}: Props = {}) {
  const router = useRouter();
  const client = useMobileApiClient();
  const powerSync = useMobilePowerSync();
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
        await createTodayJournalViaPowerSyncOrApi(
          client,
          powerSync,
          todaySlug,
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
  }, [client, isCreatingToday, isPad, onCreateTodayError, powerSync, router, todaySlug]);

  return (
    <SectionListHeader
      title="Journal"
      plusControl={
        showCreateToday ? (
          <TabStackHeaderPlusButton
            onPress={onCreateToday}
            disabled={isCreatingToday}
            accessibilityLabel="Open today's journal"
          />
        ) : null
      }
      trailingControl={
        onToggleCollapse ? (
          <PadSidePanelCollapseButton
            onCollapse={onToggleCollapse}
            accessibilityLabel="Hide Journal list"
          />
        ) : null
      }
    />
  );
}

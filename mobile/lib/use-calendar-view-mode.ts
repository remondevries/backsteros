import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";

import {
  CALENDAR_VIEW_MODE_STORAGE_KEY,
  DEFAULT_CALENDAR_VIEW_MODE,
  normalizeCalendarViewMode,
  type CalendarViewMode,
} from "./calendar/calendar-view-modes";

const memory = new Map<string, CalendarViewMode>();

export async function loadCalendarViewMode(
  storageKey = CALENDAR_VIEW_MODE_STORAGE_KEY,
): Promise<CalendarViewMode> {
  const cached = memory.get(storageKey);
  if (cached) return cached;
  try {
    const stored = await SecureStore.getItemAsync(storageKey);
    if (stored) {
      const mode = normalizeCalendarViewMode(stored);
      memory.set(storageKey, mode);
      if (mode !== stored) {
        await SecureStore.setItemAsync(storageKey, mode);
      }
      return mode;
    }
  } catch {
    // ignore
  }
  return DEFAULT_CALENDAR_VIEW_MODE;
}

export async function persistCalendarViewMode(
  mode: CalendarViewMode,
  storageKey = CALENDAR_VIEW_MODE_STORAGE_KEY,
): Promise<void> {
  memory.set(storageKey, mode);
  try {
    await SecureStore.setItemAsync(storageKey, mode);
  } catch {
    // ignore
  }
}

export function useCalendarViewMode(storageKey = CALENDAR_VIEW_MODE_STORAGE_KEY): {
  viewMode: CalendarViewMode;
  setViewMode: (next: CalendarViewMode) => void;
  ready: boolean;
} {
  const [viewMode, setViewModeState] = useState<CalendarViewMode>(() =>
    normalizeCalendarViewMode(memory.get(storageKey) ?? DEFAULT_CALENDAR_VIEW_MODE),
  );
  const [ready, setReady] = useState(() => memory.has(storageKey));

  useEffect(() => {
    let cancelled = false;
    void loadCalendarViewMode(storageKey).then((stored) => {
      if (cancelled) return;
      setViewModeState(stored);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const setViewMode = useCallback(
    (next: CalendarViewMode) => {
      setViewModeState(next);
      void persistCalendarViewMode(next, storageKey);
    },
    [storageKey],
  );

  return { viewMode, setViewMode, ready };
}

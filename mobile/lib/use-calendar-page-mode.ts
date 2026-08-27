import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";

import {
  CALENDAR_PAGE_MODE_STORAGE_KEY,
  DEFAULT_CALENDAR_PAGE_MODE,
  isCalendarPageMode,
  type CalendarPageMode,
} from "./calendar/calendar-page-mode";

const memory = new Map<string, CalendarPageMode>();
type ModeListener = (mode: CalendarPageMode, storageKey: string) => void;
const listeners = new Set<ModeListener>();

function rememberMode(mode: CalendarPageMode, storageKey: string) {
  memory.set(storageKey, mode);
  for (const listener of listeners) listener(mode, storageKey);
}

export async function loadCalendarPageMode(
  storageKey = CALENDAR_PAGE_MODE_STORAGE_KEY,
): Promise<CalendarPageMode> {
  const cached = memory.get(storageKey);
  if (cached) return cached;
  try {
    const stored = await SecureStore.getItemAsync(storageKey);
    if (stored && isCalendarPageMode(stored)) {
      rememberMode(stored, storageKey);
      return stored;
    }
  } catch {
    // ignore
  }
  return DEFAULT_CALENDAR_PAGE_MODE;
}

export async function persistCalendarPageMode(
  mode: CalendarPageMode,
  storageKey = CALENDAR_PAGE_MODE_STORAGE_KEY,
): Promise<void> {
  rememberMode(mode, storageKey);
  try {
    await SecureStore.setItemAsync(storageKey, mode);
  } catch {
    // ignore
  }
}

export function useCalendarPageMode(storageKey = CALENDAR_PAGE_MODE_STORAGE_KEY): {
  mode: CalendarPageMode;
  setMode: (next: CalendarPageMode) => void;
  ready: boolean;
} {
  const [mode, setModeState] = useState<CalendarPageMode>(
    () => memory.get(storageKey) ?? DEFAULT_CALENDAR_PAGE_MODE,
  );
  const [ready, setReady] = useState(() => memory.has(storageKey));

  useEffect(() => {
    let cancelled = false;
    void loadCalendarPageMode(storageKey).then((stored) => {
      if (cancelled) return;
      setModeState(stored);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  useEffect(() => {
    const listener: ModeListener = (next, key) => {
      if (key !== storageKey) return;
      setModeState(next);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [storageKey]);

  const setMode = useCallback(
    (next: CalendarPageMode) => {
      setModeState(next);
      void persistCalendarPageMode(next, storageKey);
    },
    [storageKey],
  );

  return { mode, setMode, ready };
}

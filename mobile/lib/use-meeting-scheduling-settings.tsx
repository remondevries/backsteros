import type {
  MeetingSchedulingSettings,
  MeetingWeekdayHoursEntry,
  UpdateMeetingSchedulingSettingsInput,
} from "@backsteros/contracts";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useMobileApiClient } from "./use-mobile-api-client";

type MeetingSchedulingSettingsContextValue = {
  settings: MeetingSchedulingSettings | null;
  loading: boolean;
  error: string | null;
  patchSettings: (input: UpdateMeetingSchedulingSettingsInput) => void;
  setWeekdayHours: (weekdayHours: MeetingWeekdayHoursEntry[]) => void;
};

const MeetingSchedulingSettingsContext =
  createContext<MeetingSchedulingSettingsContextValue | null>(null);

const PATCH_DEBOUNCE_MS = 400;

export function MeetingSchedulingSettingsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const client = useMobileApiClient();
  const [settings, setSettings] = useState<MeetingSchedulingSettings | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const patchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatchRef = useRef<UpdateMeetingSchedulingSettingsInput | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void client
      .requestJson<MeetingSchedulingSettings>(
        "/api/v1/meeting-scheduling/settings",
      )
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load settings.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const flushPatch = useCallback(async () => {
    const patch = pendingPatchRef.current;
    pendingPatchRef.current = null;
    if (!patch) return;
    try {
      const updated = await client.requestJson<MeetingSchedulingSettings>(
        "/api/v1/meeting-scheduling/settings",
        { method: "PATCH", body: JSON.stringify(patch) },
      );
      setSettings(updated);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings.");
    }
  }, [client]);

  const schedulePatch = useCallback(
    (patch: UpdateMeetingSchedulingSettingsInput) => {
      pendingPatchRef.current = {
        ...pendingPatchRef.current,
        ...patch,
      };
      if (patchTimerRef.current) clearTimeout(patchTimerRef.current);
      patchTimerRef.current = setTimeout(() => {
        patchTimerRef.current = null;
        void flushPatch();
      }, PATCH_DEBOUNCE_MS);
    },
    [flushPatch],
  );

  const patchSettings = useCallback(
    (input: UpdateMeetingSchedulingSettingsInput) => {
      setSettings((current) =>
        current ? { ...current, ...input } : current,
      );
      schedulePatch(input);
    },
    [schedulePatch],
  );

  const setWeekdayHours = useCallback(
    (weekdayHours: MeetingWeekdayHoursEntry[]) => {
      setSettings((current) =>
        current ? { ...current, weekdayHours } : current,
      );
      schedulePatch({ weekdayHours });
    },
    [schedulePatch],
  );

  useEffect(() => {
    return () => {
      if (patchTimerRef.current) clearTimeout(patchTimerRef.current);
    };
  }, []);

  const value = useMemo(
    () => ({
      settings,
      loading,
      error,
      patchSettings,
      setWeekdayHours,
    }),
    [settings, loading, error, patchSettings, setWeekdayHours],
  );

  return (
    <MeetingSchedulingSettingsContext.Provider value={value}>
      {children}
    </MeetingSchedulingSettingsContext.Provider>
  );
}

export function useMeetingSchedulingSettings(): MeetingSchedulingSettingsContextValue {
  const ctx = useContext(MeetingSchedulingSettingsContext);
  if (!ctx) {
    throw new Error(
      "useMeetingSchedulingSettings must be used within MeetingSchedulingSettingsProvider",
    );
  }
  return ctx;
}

export function useMeetingSchedulingSettingsOptional(): MeetingSchedulingSettingsContextValue | null {
  return useContext(MeetingSchedulingSettingsContext);
}

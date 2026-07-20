import { useMemo } from "react";

import { useLocalQuery } from "./use-local-query";

type SettingsRow = {
  settings: string | null;
};

function timezoneFromSettingsJson(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { timezone?: unknown };
    return typeof parsed.timezone === "string" && parsed.timezone.trim()
      ? parsed.timezone.trim()
      : null;
  } catch {
    return null;
  }
}

/** Workspace calendar timezone (desktop journal parity), else device default. */
export function useCalendarTimeZone(): string {
  const { data } = useLocalQuery<SettingsRow>(
    `SELECT settings FROM workspace_settings LIMIT 1`,
  );
  return useMemo(() => {
    const fromSync = timezoneFromSettingsJson(data?.[0]?.settings);
    return (
      fromSync ??
      Intl.DateTimeFormat().resolvedOptions().timeZone ??
      "UTC"
    );
  }, [data]);
}

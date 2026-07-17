"use client";

import type { WhoopSettingsStatus } from "@/lib/settings/whoop-status";

export async function fetchWhoopSettingsStatus(): Promise<WhoopSettingsStatus | null> {
  const response = await fetch("/api/settings/whoop/status", {
    cache: "no-store",
  });
  if (!response.ok) {
    return null;
  }

  return (await response.json()) as WhoopSettingsStatus;
}

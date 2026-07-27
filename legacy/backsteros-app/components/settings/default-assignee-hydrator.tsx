"use client";

import { useEffect } from "react";

import { useAppApi } from "@/lib/api-context";
import { syncDefaultAssigneeIdFromSettings } from "@/lib/settings/default-assignee";

/** Pull workspace default assignee into localStorage on app start. */
export function DefaultAssigneeHydrator() {
  const { client } = useAppApi();

  useEffect(() => {
    let cancelled = false;
    void client
      .requestJson<{ settings: Record<string, unknown> }>("/api/v1/settings")
      .then((body) => {
        if (cancelled) return;
        syncDefaultAssigneeIdFromSettings(body.settings);
      })
      .catch(() => {
        // keep local cache
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  return null;
}

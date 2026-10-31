import type { ProjectUpdate } from "@backsteros/contracts";
import { useEffect, useState } from "react";

import { useDesktopApi } from "./api-context";

/** Loads the most recent project update for the overview card. */
export function useProjectLatestUpdate(projectId: string | null | undefined) {
  const { client } = useDesktopApi();
  const [latestUpdate, setLatestUpdate] = useState<ProjectUpdate | null>(null);

  useEffect(() => {
    if (!projectId) {
      setLatestUpdate(null);
      return;
    }
    let cancelled = false;
    void client
      .requestJson<{ updates: ProjectUpdate[] }>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/updates`,
      )
      .then((result) => {
        if (cancelled) return;
        const updates = result.updates ?? [];
        const sorted = [...updates].sort((left, right) => {
          const leftAt = Date.parse(left.updatedAt || left.createdAt);
          const rightAt = Date.parse(right.updatedAt || right.createdAt);
          return rightAt - leftAt;
        });
        setLatestUpdate(sorted[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setLatestUpdate(null);
      });
    return () => {
      cancelled = true;
    };
  }, [client, projectId]);

  return latestUpdate;
}

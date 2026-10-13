import { useCallback, useEffect, useState } from "react";

import type { PortalContactLog } from "@backsteros/contracts";

import { useDesktopApi } from "./api-context";

type PortalLogsResponse = {
  logs?: PortalContactLog[];
  error?: string;
};

export function useContactPortalLogs(contactId: string | null | undefined) {
  const { client } = useDesktopApi();
  const [logs, setLogs] = useState<PortalContactLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!contactId) {
      setLogs([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await client.requestJson<PortalLogsResponse>(
        `/api/v1/contacts/${encodeURIComponent(contactId)}/portal-logs?limit=100`,
      );
      if (response.error) {
        throw new Error(response.error);
      }
      setLogs(response.logs ?? []);
    } catch (fetchError) {
      setLogs([]);
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Failed to load portal logs",
      );
    } finally {
      setLoading(false);
    }
  }, [client, contactId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { logs, loading, error, refresh };
}

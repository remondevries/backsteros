import type { BacksterosApiClient } from "@backsteros/api-client";
import type {
  ClientEstimate,
  CreateClientEstimateInput,
} from "@backsteros/contracts";
import type { FinanceNavId } from "@backsteros/ui";
import { useCallback, useEffect, useState } from "react";

export function useFinanceEstimates({
  client,
  navId,
}: {
  client: BacksterosApiClient;
  navId: FinanceNavId | null;
}) {
  const [estimates, setEstimates] = useState<ClientEstimate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [selectedEstimateId, setSelectedEstimateId] = useState<string | null>(
    null,
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body = await client.requestJson<{ estimates: ClientEstimate[] }>(
        "/api/v1/finance/estimates",
      );
      setEstimates(body.estimates ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load estimates",
      );
      setEstimates([]);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (navId !== "estimates") return;
    void refresh();
  }, [navId, refresh]);

  const createEstimate = useCallback(
    async (input: CreateClientEstimateInput) => {
      setCreating(true);
      setError(null);
      try {
        const created = await client.requestJson<ClientEstimate>(
          "/api/v1/finance/estimates",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          },
        );
        setEstimates((prev) => [created, ...prev]);
        setSelectedEstimateId(created.id);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create estimate",
        );
        throw err;
      } finally {
        setCreating(false);
      }
    },
    [client],
  );

  return {
    estimates,
    estimatesLoading: loading,
    estimatesError: error,
    estimatesCreating: creating,
    selectedEstimateId,
    setSelectedEstimateId,
    createEstimate,
    refreshEstimates: refresh,
  };
}

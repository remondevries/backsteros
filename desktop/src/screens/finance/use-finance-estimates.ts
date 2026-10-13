import type { BacksterosApiClient } from "@backsteros/api-client";
import type {
  ClientEstimate,
  CreateClientEstimateInput,
  UpdateClientEstimateInput,
} from "@backsteros/contracts";
import type { FinanceNavId } from "@backsteros/ui";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

export function useFinanceEstimates({
  client,
  navId,
  estimateIdFromPath = null,
}: {
  client: BacksterosApiClient;
  navId: FinanceNavId | null;
  /** Third path segment when URL is `/finance/estimates/:id`. */
  estimateIdFromPath?: string | null;
}) {
  const navigate = useNavigate();
  const [estimates, setEstimates] = useState<ClientEstimate[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const selectedEstimateId =
    navId === "estimates" ? (estimateIdFromPath ?? null) : null;

  const setSelectedEstimateId = useCallback(
    (id: string | null, options?: { replace?: boolean }) => {
      if (id) {
        void navigate({
          to: "/finance/$slug/$section",
          params: { slug: "estimates", section: id },
          replace: options?.replace,
        });
        return;
      }
      void navigate({
        to: "/finance/$slug",
        params: { slug: "estimates" },
        replace: options?.replace,
      });
    },
    [navigate],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body = await client.requestJson<{ estimates: ClientEstimate[] }>(
        "/api/v1/finance/estimates",
      );
      setEstimates(body.estimates ?? []);
      setHasLoaded(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load estimates";
      setError(
        /status 404\b/i.test(message)
          ? "Estimates API is not available on this core yet (404). Rebuild local-core / redeploy cloud on a commit that includes LDP-20."
          : message,
      );
      setEstimates([]);
      setHasLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (navId !== "estimates") {
      setHasLoaded(false);
      return;
    }
    void refresh();
  }, [navId, refresh]);

  // Stale deep link: id in URL but not in the loaded list → back to list.
  // Skip while creating so a brand-new estimate is not bounced before state lands.
  useEffect(() => {
    if (
      navId !== "estimates" ||
      !hasLoaded ||
      loading ||
      creating ||
      !estimateIdFromPath
    ) {
      return;
    }
    if (estimates.some((row) => row.id === estimateIdFromPath)) return;
    void navigate({
      to: "/finance/$slug",
      params: { slug: "estimates" },
      replace: true,
    });
  }, [
    creating,
    estimateIdFromPath,
    estimates,
    hasLoaded,
    loading,
    navId,
    navigate,
  ]);

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
        void navigate({
          to: "/finance/$slug/$section",
          params: { slug: "estimates", section: created.id },
        });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create estimate",
        );
        throw err;
      } finally {
        setCreating(false);
      }
    },
    [client, navigate],
  );

  const updateEstimate = useCallback(
    async (id: string, patch: UpdateClientEstimateInput) => {
      setError(null);
      // Optimistic merge so multi-select fields (e.g. toContactIds) update
      // immediately even if an older core omits them from the PATCH response.
      setEstimates((prev) =>
        prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
      );
      try {
        const updated = await client.requestJson<ClientEstimate>(
          `/api/v1/finance/estimates/${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          },
        );
        setEstimates((prev) =>
          prev.map((row) =>
            row.id === id
              ? {
                  ...updated,
                  // Prefer local patch values when the server build does not
                  // yet echo newer fields.
                  toContactIds:
                    patch.toContactIds !== undefined
                      ? patch.toContactIds
                      : (updated.toContactIds ?? row.toContactIds ?? []),
                }
              : row,
          ),
        );
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to update estimate",
        );
        void refresh();
        throw err;
      }
    },
    [client, refresh],
  );

  return {
    estimates,
    estimatesLoading: loading,
    estimatesError: error,
    estimatesCreating: creating,
    selectedEstimateId,
    setSelectedEstimateId,
    createEstimate,
    updateEstimate,
    refreshEstimates: refresh,
  };
}

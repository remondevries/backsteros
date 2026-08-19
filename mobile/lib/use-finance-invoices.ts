import type {
  MoneybirdSalesInvoiceDetail,
  MoneybirdSalesInvoiceSummary,
  MoneybirdSettings,
} from "@backsteros/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchMoneybirdInvoiceDetail,
  fetchMoneybirdInvoices,
  fetchMoneybirdSettings,
} from "./finance-api";
import { useMobileApiClient } from "./use-mobile-api-client";

const PAGE_SIZE = 50;

/**
 * Moneybird sales invoices — REST live proxy (no PowerSync table).
 */
export function useFinanceInvoices(filter?: string) {
  const client = useMobileApiClient();
  const [settings, setSettings] = useState<MoneybirdSettings | null>(null);
  const [invoices, setInvoices] = useState<MoneybirdSalesInvoiceSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settingsRef = useRef<MoneybirdSettings | null>(null);

  const loadPage = useCallback(
    async (nextPage: number, mode: "replace" | "append") => {
      if (mode === "append") setLoadingMore(true);
      else setLoading(true);
      try {
        const needSettings = nextPage === 1 || settingsRef.current == null;
        const [moneybird, body] = await Promise.all([
          needSettings
            ? fetchMoneybirdSettings(client)
            : Promise.resolve(settingsRef.current),
          fetchMoneybirdInvoices(client, {
            page: nextPage,
            perPage: PAGE_SIZE,
            filter: filter || undefined,
          }),
        ]);
        if (moneybird) {
          settingsRef.current = moneybird;
          setSettings(moneybird);
        }
        setInvoices((prev) =>
          mode === "append" ? [...prev, ...body.invoices] : body.invoices,
        );
        setPage(body.page);
        setHasMore(body.hasMore);
        setError(null);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [client, filter],
  );

  useEffect(() => {
    void loadPage(1, "replace");
  }, [loadPage]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadPage(1, "replace");
  }, [loadPage]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return;
    await loadPage(page + 1, "append");
  }, [hasMore, loading, loadingMore, loadPage, page]);

  return {
    settings,
    connected: Boolean(settings?.connected),
    invoices,
    loading,
    loadingMore,
    refreshing,
    error,
    hasMore,
    refresh,
    loadMore,
  };
}

export function useFinanceInvoiceDetail(invoiceId: string | null) {
  const client = useMobileApiClient();
  const [detail, setDetail] = useState<MoneybirdSalesInvoiceDetail | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!invoiceId) {
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const next = await fetchMoneybirdInvoiceDetail(client, invoiceId);
        if (!cancelled) {
          setDetail(next);
          setError(null);
        }
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
          setDetail(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, invoiceId]);

  return { detail, loading, error };
}

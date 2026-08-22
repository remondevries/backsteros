import type { BacksterosApiClient } from "@backsteros/api-client";
import type {
  BankAccountCashflowMonth,
  MoneybirdInvoiceRevenue,
  MoneybirdSalesInvoiceDetail,
  MoneybirdSalesInvoiceSummary,
  MoneybirdSettings,
  WorkspaceCashflow,
} from "@backsteros/contracts";
import {
  buildMoneybirdInvoicesFilter,
  type FinanceNavId,
} from "@backsteros/ui";
import { useCallback, useEffect, useState } from "react";

import { mergeInvoiceRevenueWithAccountExpenses } from "./finance-page-helpers";

export function useFinanceMoneybirdInvoices({
  client,
  navId,
}: {
  client: BacksterosApiClient;
  navId: FinanceNavId | null;
}) {
  const [moneybirdInvoices, setMoneybirdInvoices] = useState<
    MoneybirdSalesInvoiceSummary[]
  >([]);
  const [moneybirdInvoicesLoading, setMoneybirdInvoicesLoading] =
    useState(false);
  const [moneybirdInvoicesError, setMoneybirdInvoicesError] = useState<
    string | null
  >(null);
  const [moneybirdInvoicesPage, setMoneybirdInvoicesPage] = useState(1);
  const [moneybirdInvoicesTotalPages, setMoneybirdInvoicesTotalPages] =
    useState(1);
  const [moneybirdInvoicesHasMore, setMoneybirdInvoicesHasMore] =
    useState(false);
  const [moneybirdInvoicesYear, setMoneybirdInvoicesYear] = useState(() =>
    new Date().getFullYear(),
  );
  const [moneybirdInvoiceStatusIds, setMoneybirdInvoiceStatusIds] = useState<
    string[]
  >([]);
  const [moneybirdConnected, setMoneybirdConnected] = useState(false);
  const [moneybirdRevenueYear, setMoneybirdRevenueYear] = useState<
    number | null
  >(null);
  const [moneybirdRevenueMonths, setMoneybirdRevenueMonths] = useState<
    BankAccountCashflowMonth[] | null
  >(null);
  const [moneybirdRevenueLoading, setMoneybirdRevenueLoading] = useState(false);
  const [selectedMoneybirdInvoiceId, setSelectedMoneybirdInvoiceId] = useState<
    string | null
  >(null);
  const [moneybirdInvoiceDetail, setMoneybirdInvoiceDetail] =
    useState<MoneybirdSalesInvoiceDetail | null>(null);
  const [moneybirdInvoiceDetailLoading, setMoneybirdInvoiceDetailLoading] =
    useState(false);
  const [moneybirdInvoiceDetailError, setMoneybirdInvoiceDetailError] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (navId !== "invoices") return;
    let cancelled = false;
    setMoneybirdInvoicesLoading(true);
    setMoneybirdInvoicesError(null);
    void (async () => {
      try {
        const settings = await client.requestJson<MoneybirdSettings>(
          "/api/v1/settings/moneybird",
        );
        if (cancelled) return;
        setMoneybirdConnected(settings.connected);
        if (!settings.connected) {
          setMoneybirdInvoices([]);
          setMoneybirdInvoicesHasMore(false);
          setMoneybirdInvoicesTotalPages(1);
          return;
        }
        const listParams = new URLSearchParams({
          page: String(moneybirdInvoicesPage),
          perPage: "50",
          filter: buildMoneybirdInvoicesFilter(
            moneybirdInvoicesYear,
            moneybirdInvoiceStatusIds,
          ),
        });
        const listBody = await client.requestJson<{
          invoices: MoneybirdSalesInvoiceSummary[];
          hasMore?: boolean;
          totalPages?: number;
        }>(`/api/v1/finance/moneybird/invoices?${listParams}`);
        if (cancelled) return;
        setMoneybirdInvoices(listBody.invoices);
        setMoneybirdInvoicesHasMore(Boolean(listBody.hasMore));
        setMoneybirdInvoicesTotalPages(
          typeof listBody.totalPages === "number" && listBody.totalPages >= 1
            ? listBody.totalPages
            : Math.max(1, moneybirdInvoicesPage),
        );
      } catch (error) {
        if (cancelled) return;
        setMoneybirdInvoices([]);
        setMoneybirdInvoicesHasMore(false);
        setMoneybirdInvoicesTotalPages(1);
        setMoneybirdInvoicesError(
          error instanceof Error
            ? error.message
            : "Failed to load Moneybird invoices",
        );
      } finally {
        if (!cancelled) setMoneybirdInvoicesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    client,
    moneybirdInvoiceStatusIds,
    moneybirdInvoicesPage,
    moneybirdInvoicesYear,
    navId,
  ]);

  useEffect(() => {
    if (navId !== "invoices") {
      setSelectedMoneybirdInvoiceId(null);
      setMoneybirdInvoiceDetail(null);
      setMoneybirdInvoiceDetailError(null);
      setMoneybirdInvoiceDetailLoading(false);
    }
  }, [navId]);

  useEffect(() => {
    setSelectedMoneybirdInvoiceId(null);
  }, [moneybirdInvoicesPage, moneybirdInvoicesYear, moneybirdInvoiceStatusIds]);

  useEffect(() => {
    if (navId !== "invoices" || !selectedMoneybirdInvoiceId) {
      setMoneybirdInvoiceDetail(null);
      setMoneybirdInvoiceDetailError(null);
      setMoneybirdInvoiceDetailLoading(false);
      return;
    }
    let cancelled = false;
    setMoneybirdInvoiceDetailLoading(true);
    setMoneybirdInvoiceDetailError(null);
    void (async () => {
      try {
        const detail = await client.requestJson<MoneybirdSalesInvoiceDetail>(
          `/api/v1/finance/moneybird/invoices/${encodeURIComponent(selectedMoneybirdInvoiceId)}`,
        );
        if (cancelled) return;
        setMoneybirdInvoiceDetail(detail);
      } catch (error) {
        if (cancelled) return;
        setMoneybirdInvoiceDetail(null);
        setMoneybirdInvoiceDetailError(
          error instanceof Error
            ? error.message
            : "Failed to load invoice detail",
        );
      } finally {
        if (!cancelled) setMoneybirdInvoiceDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, navId, selectedMoneybirdInvoiceId]);

  useEffect(() => {
    if (navId !== "invoices") return;
    let cancelled = false;
    setMoneybirdRevenueLoading(true);
    void (async () => {
      try {
        const settings = await client.requestJson<MoneybirdSettings>(
          "/api/v1/settings/moneybird",
        );
        if (cancelled) return;
        setMoneybirdConnected(settings.connected);
        if (!settings.connected) {
          setMoneybirdRevenueYear(null);
          setMoneybirdRevenueMonths(null);
          return;
        }
        const year = moneybirdInvoicesYear;
        const [revenueBody, cashflowBody] = await Promise.all([
          client.requestJson<MoneybirdInvoiceRevenue>(
            `/api/v1/finance/moneybird/invoice-revenue?year=${year}`,
          ),
          client
            .requestJson<WorkspaceCashflow>(
              `/api/v1/finance/cashflow?year=${year}`,
            )
            .catch(() => null),
        ]);
        if (cancelled) return;
        setMoneybirdRevenueYear(revenueBody.year);
        setMoneybirdRevenueMonths(
          mergeInvoiceRevenueWithAccountExpenses(
            revenueBody.months,
            cashflowBody?.months,
          ),
        );
      } catch {
        if (cancelled) return;
        setMoneybirdRevenueYear(null);
        setMoneybirdRevenueMonths(null);
      } finally {
        if (!cancelled) setMoneybirdRevenueLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, moneybirdInvoicesYear, navId]);

  const loadMoneybirdInvoicesPage = useCallback(async () => {
    setMoneybirdInvoicesLoading(true);
    setMoneybirdInvoicesError(null);
    setMoneybirdRevenueLoading(true);
    try {
      const settings = await client.requestJson<MoneybirdSettings>(
        "/api/v1/settings/moneybird",
      );
      setMoneybirdConnected(settings.connected);
      if (!settings.connected) {
        setMoneybirdInvoices([]);
        setMoneybirdInvoicesHasMore(false);
        setMoneybirdInvoicesTotalPages(1);
        setMoneybirdRevenueYear(null);
        setMoneybirdRevenueMonths(null);
        return;
      }
      const year = moneybirdInvoicesYear;
      const listParams = new URLSearchParams({
        page: String(moneybirdInvoicesPage),
        perPage: "50",
        filter: buildMoneybirdInvoicesFilter(year, moneybirdInvoiceStatusIds),
      });
      const [listBody, revenueBody, cashflowBody] = await Promise.all([
        client.requestJson<{
          invoices: MoneybirdSalesInvoiceSummary[];
          hasMore?: boolean;
          totalPages?: number;
        }>(`/api/v1/finance/moneybird/invoices?${listParams}`),
        client.requestJson<MoneybirdInvoiceRevenue>(
          `/api/v1/finance/moneybird/invoice-revenue?year=${year}`,
        ),
        client
          .requestJson<WorkspaceCashflow>(
            `/api/v1/finance/cashflow?year=${year}`,
          )
          .catch(() => null),
      ]);
      setMoneybirdInvoices(listBody.invoices);
      setMoneybirdInvoicesHasMore(Boolean(listBody.hasMore));
      setMoneybirdInvoicesTotalPages(
        typeof listBody.totalPages === "number" && listBody.totalPages >= 1
          ? listBody.totalPages
          : Math.max(1, moneybirdInvoicesPage),
      );
      setMoneybirdRevenueYear(revenueBody.year);
      setMoneybirdRevenueMonths(
        mergeInvoiceRevenueWithAccountExpenses(
          revenueBody.months,
          cashflowBody?.months,
        ),
      );
    } catch (error) {
      setMoneybirdInvoices([]);
      setMoneybirdInvoicesHasMore(false);
      setMoneybirdInvoicesTotalPages(1);
      setMoneybirdRevenueYear(null);
      setMoneybirdRevenueMonths(null);
      setMoneybirdInvoicesError(
        error instanceof Error
          ? error.message
          : "Failed to load Moneybird invoices",
      );
    } finally {
      setMoneybirdInvoicesLoading(false);
      setMoneybirdRevenueLoading(false);
    }
  }, [
    client,
    moneybirdInvoiceStatusIds,
    moneybirdInvoicesPage,
    moneybirdInvoicesYear,
  ]);

  return {
    moneybirdInvoices,
    moneybirdInvoicesLoading,
    moneybirdInvoicesError,
    moneybirdInvoicesPage,
    setMoneybirdInvoicesPage,
    moneybirdInvoicesTotalPages,
    moneybirdInvoicesHasMore,
    moneybirdInvoicesYear,
    setMoneybirdInvoicesYear,
    moneybirdInvoiceStatusIds,
    setMoneybirdInvoiceStatusIds,
    moneybirdConnected,
    moneybirdRevenueYear,
    moneybirdRevenueMonths,
    moneybirdRevenueLoading,
    selectedMoneybirdInvoiceId,
    setSelectedMoneybirdInvoiceId,
    moneybirdInvoiceDetail,
    moneybirdInvoiceDetailLoading,
    moneybirdInvoiceDetailError,
    loadMoneybirdInvoicesPage,
  };
}

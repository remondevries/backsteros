"use client";

import { useMemo, type ReactNode } from "react";

import {
  buildTopCustomerShares,
  calendarMonthKey,
  previousCalendarMonthKey,
  resolveMonthTotalCents,
  type DocumentSummaryLine,
} from "../../finance/document-summary-stats.js";

function formatEuroCents(cents: number): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `€${(cents / 100).toFixed(2)}`;
  }
}

function formatMonthTitle(monthKey: string): string {
  const [yearRaw, monthRaw] = monthKey.split("-");
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  if (!Number.isFinite(year) || monthIndex < 0 || monthIndex > 11) {
    return monthKey;
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "long",
      year: "numeric",
    }).format(new Date(year, monthIndex, 1));
  } catch {
    return monthKey;
  }
}

function formatSharePercent(share: number): string {
  const pct = share * 100;
  if (pct >= 10) return `${Math.round(pct)}%`;
  return `${pct.toFixed(1)}%`;
}

function SummaryMetricCard({
  title,
  amountCents,
  subtitle,
  loading = false,
}: {
  title: string;
  amountCents: number;
  subtitle?: string;
  loading?: boolean;
}) {
  return (
    <section className="finance-doc-summary__metric">
      <header className="finance-doc-summary__metric-header">
        <h3 className="finance-doc-summary__metric-title">{title}</h3>
      </header>
      <p className="finance-doc-summary__metric-value">
        {loading ? "…" : formatEuroCents(amountCents)}
      </p>
      {subtitle ? (
        <p className="finance-doc-summary__metric-subtitle">{subtitle}</p>
      ) : null}
    </section>
  );
}

export type FinanceDocumentSummaryWidgetsProps = {
  lines: readonly DocumentSummaryLine[];
  /** Optional authoritative monthly income series (e.g. Moneybird revenue). */
  seriesMonths?: ReadonlyArray<{ month: string; incomeCents: number }> | null;
  /** Scope the top-customer bar to this calendar year (chart year). */
  customerYear?: number | null;
  /** Title for the customer share widget. */
  customersTitle?: string;
  loading?: boolean;
  className?: string;
};

export function FinanceDocumentSummaryWidgets({
  lines,
  seriesMonths = null,
  customerYear = null,
  customersTitle = "Best paying customers",
  loading = false,
  className,
}: FinanceDocumentSummaryWidgetsProps) {
  const thisMonthKey = calendarMonthKey();
  const lastMonthKey = previousCalendarMonthKey();

  const thisMonthCents = useMemo(
    () =>
      resolveMonthTotalCents({
        monthKey: thisMonthKey,
        lines,
        seriesMonths,
      }),
    [lines, seriesMonths, thisMonthKey],
  );

  const lastMonthCents = useMemo(
    () =>
      resolveMonthTotalCents({
        monthKey: lastMonthKey,
        lines,
        seriesMonths,
      }),
    [lastMonthKey, lines, seriesMonths],
  );

  const customerShares = useMemo(
    () =>
      buildTopCustomerShares(lines, {
        limit: 3,
        year: customerYear,
      }),
    [customerYear, lines],
  );

  return (
    <div
      className={["finance-doc-summary", className].filter(Boolean).join(" ")}
    >
      <SummaryMetricCard
        title="Total this month"
        amountCents={thisMonthCents}
        subtitle={formatMonthTitle(thisMonthKey)}
        loading={loading}
      />
      <SummaryMetricCard
        title="Total last month"
        amountCents={lastMonthCents}
        subtitle={formatMonthTitle(lastMonthKey)}
        loading={loading}
      />
      <section className="finance-doc-summary__customers">
        <header className="finance-doc-summary__metric-header">
          <h3 className="finance-doc-summary__metric-title">
            {customersTitle}
          </h3>
        </header>
        {loading ? (
          <p className="finance-doc-summary__empty">Loading…</p>
        ) : customerShares.length === 0 ? (
          <p className="finance-doc-summary__empty">No customer totals yet.</p>
        ) : (
          <>
            <div
              className="finance-doc-summary__share-bar"
              role="img"
              aria-label="Customer share of totals"
            >
              {customerShares.map((segment) => (
                <span
                  key={segment.key}
                  className="finance-doc-summary__share-segment"
                  style={{
                    width: `${Math.max(segment.share * 100, 0)}%`,
                    background: segment.color,
                  }}
                  title={`${segment.label}: ${formatEuroCents(segment.amountCents)}`}
                />
              ))}
            </div>
            <ul className="finance-doc-summary__share-legend">
              {customerShares.map((segment) => (
                <li
                  key={segment.key}
                  className="finance-doc-summary__share-row"
                >
                  <span
                    className="finance-doc-summary__share-dot"
                    style={{ background: segment.color }}
                    aria-hidden="true"
                  />
                  <span className="finance-doc-summary__share-label">
                    {segment.label}
                  </span>
                  <span className="finance-doc-summary__share-pct">
                    {formatSharePercent(segment.share)}
                  </span>
                  <span className="finance-doc-summary__share-amount">
                    {formatEuroCents(segment.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

export type FinanceDocumentChartWithSummaryProps = {
  summary: ReactNode;
  chart: ReactNode;
  /** Optional control above the chart (e.g. year picker), left-aligned. */
  chartHeader?: ReactNode;
  className?: string;
};

/** Wide: summary left of chart. Narrow: chart first, summary below. */
export function FinanceDocumentChartWithSummary({
  summary,
  chart,
  chartHeader = null,
  className,
}: FinanceDocumentChartWithSummaryProps) {
  return (
    <div
      className={[
        "finance-doc-chart-with-summary",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="finance-doc-chart-with-summary__summary">{summary}</div>
      <div className="finance-doc-chart-with-summary__chart">
        {chartHeader ? (
          <div className="finance-doc-chart-with-summary__chart-header">
            {chartHeader}
          </div>
        ) : null}
        {chart}
      </div>
    </div>
  );
}

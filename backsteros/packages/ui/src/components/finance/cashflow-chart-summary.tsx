"use client";

import { TriangleDownIcon, TriangleUpIcon } from "@primer/octicons-react";

import {
  formatNetIncomeRangeLabel,
  netIncomeChangePercent,
} from "../../finance/net-income-year-chart-series.js";

function formatEuro(value: number, fractionDigits = 2): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: fractionDigits,
    }).format(value);
  } catch {
    return `€${value.toFixed(fractionDigits)}`;
  }
}

function formatPercent(value: number): string {
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return `${value.toFixed(digits)}%`;
}

function parseAsOfDate(asOf: string): Date {
  const [y, m, d] = asOf.split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

export type CashflowChartSummaryProps = {
  year: number;
  asOf: string;
  ytdCents: number;
  priorYtdCents: number;
  loading?: boolean;
  /**
   * `income`: higher is good (green).
   * `spend`: higher is bad (red).
   * `net`: sign of the total drives color; delta follows usual higher=green.
   */
  sense?: "income" | "spend" | "net";
};

export function CashflowChartSummary({
  year,
  asOf,
  ytdCents,
  priorYtdCents,
  loading = false,
  sense = "net",
}: CashflowChartSummaryProps) {
  const asOfDate = parseAsOfDate(asOf);
  const rangeLabel = formatNetIncomeRangeLabel(
    new Date(year, 0, 1),
    asOfDate,
  );
  const priorRangeLabel = formatNetIncomeRangeLabel(
    new Date(year - 1, 0, 1),
    new Date(year - 1, asOfDate.getMonth(), asOfDate.getDate()),
  );

  const ytdEuros = ytdCents / 100;
  const priorEuros = priorYtdCents / 100;
  const change = netIncomeChangePercent(ytdCents, priorYtdCents);
  const changeUp = change == null ? ytdCents >= 0 : change >= 0;

  let totalTone: "positive" | "negative" | "neutral";
  if (sense === "income") totalTone = "positive";
  else if (sense === "spend") totalTone = "neutral";
  else totalTone = ytdEuros >= 0 ? "positive" : "negative";

  let deltaTone: "positive" | "negative" = changeUp ? "positive" : "negative";
  if (sense === "spend") {
    deltaTone = changeUp ? "negative" : "positive";
  }

  return (
    <header className="finance-net-income-chart__summary">
      <p className="finance-net-income-chart__range">{rangeLabel}</p>
      <p
        className={[
          "finance-net-income-chart__total",
          totalTone === "positive"
            ? "finance-net-income-chart__total--positive"
            : totalTone === "negative"
              ? "finance-net-income-chart__total--negative"
              : null,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {loading ? "…" : formatEuro(ytdEuros, 2)}
      </p>
      <div className="finance-net-income-chart__compare">
        {change != null ? (
          <span
            className={[
              "finance-net-income-chart__delta",
              deltaTone === "positive"
                ? "finance-net-income-chart__delta--positive"
                : "finance-net-income-chart__delta--negative",
            ].join(" ")}
          >
            {changeUp ? (
              <TriangleUpIcon size={12} />
            ) : (
              <TriangleDownIcon size={12} />
            )}
            {formatPercent(Math.abs(change))}
          </span>
        ) : ytdCents !== 0 ? (
          <span
            className={[
              "finance-net-income-chart__delta",
              sense === "spend"
                ? "finance-net-income-chart__delta--negative"
                : "finance-net-income-chart__delta--positive",
            ].join(" ")}
          >
            New
          </span>
        ) : null}
        <span className="finance-net-income-chart__compare-text">
          vs {formatEuro(priorEuros, 2)} in {priorRangeLabel}
        </span>
      </div>
    </header>
  );
}

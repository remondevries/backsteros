"use client";

import type {
  FinanceSpendPanel,
  FinancialCategory,
} from "@backsteros/contracts";
import {
  ResponsiveBar,
  type BarDatum,
  type BarTooltipProps,
} from "@nivo/bar";
import { ChevronDownIcon, XIcon } from "@primer/octicons-react";
import { useMemo, useState } from "react";

import {
  DEFAULT_ENTITY_ICON_COLOR,
} from "../entity-icon.js";
import { DefaultProjectIcon } from "./default-project-icon.js";
import { FinanceDetailSectionTitle } from "./finance-detail-section-title.js";
import { FinanceChartTooltip } from "./finance-chart-tooltip.js";
import {
  FinanceChartEmpty,
  FinanceChartFadeIn,
  FinanceChartLoading,
} from "./finance-chart-status.js";
import {
  getDisplayProjectIcon,
  getEntityIconColor,
  ProjectOcticon,
} from "./project-octicon.js";

const BAR_COLOR_FALLBACK = "#5B9FD8";

function formatMoney(cents: number, fractionDigits = 2): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: fractionDigits,
    }).format(cents / 100);
  } catch {
    return `€${(cents / 100).toFixed(fractionDigits)}`;
  }
}

function formatMonthTitle(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(y || 1970, (m || 1) - 1, 1);
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function monthLetter(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(y || 1970, (m || 1) - 1, 1);
  return date.toLocaleDateString(undefined, { month: "narrow" });
}

function readCssColor(variable: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
  return value || fallback;
}

function CategoryIcon({
  icon,
  size = 16,
}: {
  icon: string | null | undefined;
  size?: number;
}) {
  const color = getEntityIconColor(icon);
  const display = getDisplayProjectIcon(icon);
  if (!display) {
    return (
      <DefaultProjectIcon
        size={size}
        style={color ? { color } : undefined}
      />
    );
  }
  return (
    <ProjectOcticon
      icon={icon}
      size={size}
      style={color ? { color } : undefined}
    />
  );
}

type CategoryRow = {
  key: string;
  name: string;
  icon: string | null;
  color: string;
  expenseCents: number;
};

function buildCategoryRows(
  categories: FinancialCategory[],
  spend: FinanceSpendPanel["categories"],
): CategoryRow[] {
  const byId = new Map(categories.map((row) => [row.id, row]));

  return spend
    .filter((row) => row.expenseCents !== 0)
    .map((row) => {
      if (row.categoryId == null) {
        return {
          key: "__uncategorized__",
          name: "Uncategorized",
          icon: null,
          color: "#94A3B8",
          expenseCents: row.expenseCents,
        };
      }
      const category = byId.get(row.categoryId);
      return {
        key: row.categoryId,
        name: category?.name ?? "Category",
        icon: category?.icon ?? null,
        color: getEntityIconColor(category?.icon) ?? DEFAULT_ENTITY_ICON_COLOR,
        expenseCents: row.expenseCents,
      };
    })
    .sort(
      (a, b) => Math.abs(b.expenseCents) - Math.abs(a.expenseCents),
    );
}

function HistoryTooltip({
  indexValue,
  data,
}: Pick<BarTooltipProps<BarDatum>, "indexValue" | "data">) {
  const title =
    typeof data.monthTitle === "string" ? data.monthTitle : String(indexValue);
  const expense = Number(data.expense ?? 0);
  return (
    <FinanceChartTooltip className="finance-accounts-view__chart-tooltip">
      <div className="finance-accounts-view__chart-tooltip-title">{title}</div>
      <div className="finance-accounts-view__chart-tooltip-row">
        <span
          className="finance-accounts-view__chart-tooltip-swatch"
          style={{ background: BAR_COLOR_FALLBACK }}
        />
        <span>Spend</span>
        <strong>{formatMoney(Math.round(expense * 100))}</strong>
      </div>
    </FinanceChartTooltip>
  );
}

export type FinanceSpendSidePanelProps = {
  panel: FinanceSpendPanel | null;
  categories: FinancialCategory[];
  loading?: boolean;
  onClose: () => void;
  onSelectMonth: (month: string) => void;
};

export function FinanceSpendSidePanel({
  panel,
  categories,
  loading = false,
  onClose,
  onSelectMonth,
}: FinanceSpendSidePanelProps) {
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(
    null,
  );

  const categoryRows = useMemo(
    () => (panel ? buildCategoryRows(categories, panel.categories) : []),
    [categories, panel],
  );

  const effectiveSelected =
    selectedCategoryKey &&
    categoryRows.some((row) => row.key === selectedCategoryKey)
      ? selectedCategoryKey
      : (categoryRows[0]?.key ?? null);

  const barData: BarDatum[] = useMemo(() => {
    if (!panel) return [];
    return panel.history.map((row) => ({
      month: row.month,
      expense: row.expenseCents / 100,
      letter: monthLetter(row.month),
      monthTitle: formatMonthTitle(row.month),
      isSelected: row.month === panel.month ? 1 : 0,
    }));
  }, [panel]);

  const paints = useMemo(() => {
    const muted = readCssColor("--muted", "#888");
    const foreground = readCssColor("--foreground", "#fff");
    return { muted, foreground };
  }, []);

  const theme = useMemo(
    () => ({
      background: "transparent",
      text: { fill: paints.muted, fontSize: 10 },
      axis: {
        ticks: { text: { fill: paints.muted, fontSize: 10 } },
        domain: { line: { stroke: "transparent" } },
      },
      grid: { line: { stroke: "transparent" } },
      tooltip: {
        container: {
          background: "transparent",
          boxShadow: "none",
          padding: 0,
        },
      },
    }),
    [paints.muted],
  );

  const tickValues = useMemo(() => {
    if (barData.length <= 12) return undefined;
    const step = Math.ceil(barData.length / 12);
    return barData
      .filter((_, index, all) => index % step === 0 || index === all.length - 1)
      .map((row) => row.month);
  }, [barData]);

  return (
    <aside
      className="finance-categories-view__detail finance-spend-panel"
      aria-label="Spend"
    >
      <header className="finance-spend-panel__header">
        <div className="finance-spend-panel__header-main">
          <div className="finance-spend-panel__title-row">
            <button
              type="button"
              className="finance-spend-panel__title-button"
              aria-label="Spend"
            >
              <span>Spend</span>
              <ChevronDownIcon size={14} />
            </button>
            <button
              type="button"
              className="finance-spend-panel__close"
              aria-label="Close"
              onClick={onClose}
            >
              <XIcon size={16} />
            </button>
          </div>
          <p className="finance-spend-panel__subtitle">
            Monthly spend not including recurrings left to pay
          </p>
        </div>
        <div className="finance-spend-panel__header-total">
          <span className="finance-spend-panel__month-label">
            {panel ? formatMonthTitle(panel.month) : "—"}
          </span>
          <span className="finance-spend-panel__month-amount">
            {loading && !panel
              ? "…"
              : formatMoney(panel?.monthExpenseCents ?? 0)}
          </span>
        </div>
      </header>

      <section
        className="finance-spend-panel__chart"
        aria-label="Spend history"
      >
        {loading && !panel ? (
          <FinanceChartLoading />
        ) : barData.length === 0 ? (
          <FinanceChartEmpty>No spending history yet.</FinanceChartEmpty>
        ) : (
          <FinanceChartFadeIn>
            <ResponsiveBar
              data={barData}
              keys={["expense"]}
              indexBy="month"
              margin={{ top: 8, right: 4, bottom: 22, left: 4 }}
              padding={0.22}
              valueScale={{ type: "linear", min: 0, max: "auto" }}
              indexScale={{ type: "band", round: true }}
              colors={(bar) =>
                Number(bar.data.isSelected) === 1
                  ? paints.foreground
                  : BAR_COLOR_FALLBACK
              }
              borderRadius={2}
              enableLabel={false}
              enableGridX={false}
              enableGridY={false}
              axisTop={null}
              axisRight={null}
              axisLeft={null}
              axisBottom={{
                tickSize: 0,
                tickPadding: 8,
                tickValues,
                format: (value) => {
                  const row = barData.find((entry) => entry.month === value);
                  return String(row?.letter ?? "");
                },
              }}
              theme={theme}
              onClick={(bar) => {
                const month = String(bar.indexValue);
                if (/^\d{4}-\d{2}$/.test(month)) onSelectMonth(month);
              }}
              tooltip={(props) => <HistoryTooltip {...props} />}
              role="application"
              ariaLabel="Monthly spend history"
            />
          </FinanceChartFadeIn>
        )}
      </section>

      <section className="finance-categories-view__metrics finance-spend-panel__metrics">
        <FinanceDetailSectionTitle>Key metrics</FinanceDetailSectionTitle>
        <div className="finance-categories-view__metrics-head">
          <span className="finance-categories-view__metrics-col finance-categories-view__metrics-col--start">
            Year
          </span>
          <span className="finance-categories-view__metrics-col">
            Spend per year
          </span>
          <span className="finance-categories-view__metrics-col">
            Avg monthly spend
          </span>
        </div>
        {panel?.yearMetrics.length ? (
          panel.yearMetrics.map((entry) => (
            <div
              key={entry.year}
              className="finance-categories-view__metrics-row"
            >
              <span className="finance-categories-view__metrics-year">
                {entry.year}
              </span>
              <span className="finance-categories-view__metrics-value">
                {formatMoney(entry.spendCents)}
              </span>
              <span className="finance-categories-view__metrics-value">
                {formatMoney(entry.avgMonthlyCents)}
              </span>
            </div>
          ))
        ) : (
          <div className="finance-categories-view__metrics-empty">
            {loading ? "Loading metrics…" : "No spending recorded yet."}
          </div>
        )}
      </section>

      <section className="finance-spend-panel__categories" aria-label="Categories">
        <h3 className="finance-spend-panel__categories-title">Categories</h3>
        {categoryRows.length === 0 ? (
          <p className="finance-spend-panel__categories-empty">
            {loading ? "Loading…" : "No categorized spend this month."}
          </p>
        ) : (
          <ul className="finance-spend-panel__category-list">
            {categoryRows.map((row) => {
              const selected = row.key === effectiveSelected;
              return (
                <li key={row.key}>
                  <button
                    type="button"
                    className={[
                      "finance-spend-panel__category-row",
                      selected ? "is-selected" : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={
                      selected
                        ? {
                            background: `color-mix(in srgb, ${row.color} 16%, transparent)`,
                          }
                        : undefined
                    }
                    onClick={() => setSelectedCategoryKey(row.key)}
                  >
                    <span
                      className="finance-spend-panel__category-dot"
                      style={{ background: row.color }}
                      aria-hidden="true"
                    />
                    <span
                      className="finance-spend-panel__category-icon"
                      style={{ color: row.color }}
                      aria-hidden="true"
                    >
                      <CategoryIcon icon={row.icon} size={14} />
                    </span>
                    <span
                      className="finance-spend-panel__category-name"
                      style={{ color: row.color }}
                    >
                      {row.name}
                    </span>
                    <span
                      className={[
                        "finance-spend-panel__category-amount",
                        row.expenseCents > 0
                          ? "is-debit"
                          : row.expenseCents < 0
                            ? "is-credit"
                            : null,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {formatMoney(
                        row.expenseCents === 0 ? 0 : -row.expenseCents,
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </aside>
  );
}

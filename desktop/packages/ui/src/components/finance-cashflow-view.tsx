"use client";

import type {
  FinanceSpendPanel,
  FinancialCategory,
  WorkspaceCashflow,
} from "@backsteros/contracts";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { useFinancePanelResize } from "../use-finance-panel-resize.js";
import {
  CashflowIncomeYearChart,
  CashflowSpendYearChart,
} from "./cashflow-spend-income-charts.js";
import { EntityDetailLayout } from "./entity-detail-layout.js";
import {
  asOfForMonthKey,
  FinanceMonthNavigator,
  localMonthKey,
} from "./finance-month-navigator.js";
import { FinanceSpendSidePanel } from "./finance-spend-side-panel.js";
import { NetIncomeYearChart } from "./net-income-year-chart.js";

const FINANCE_CASHFLOW_DETAIL_WIDTH_KEY =
  "backsteros-desktop.finance-cashflow-detail-width";

export type FinanceCashflowViewProps = {
  cashflow: WorkspaceCashflow | null;
  categories: FinancialCategory[];
  loading?: boolean;
  error?: string | null;
  /** Selected month (`YYYY-MM`) — drives YTD end date for charts. */
  chartMonth?: string | null;
  onChartMonthChange?: (month: string) => void;
  spendPanel: FinanceSpendPanel | null;
  spendPanelLoading?: boolean;
  onOpenSpendPanel: (month?: string) => void;
  onCloseSpendPanel: () => void;
  onSpendPanelMonthChange: (month: string) => void;
};

function formatAsOfIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function CashflowWidget({
  title,
  children,
  empty,
  className,
  onOpen,
}: {
  title: string;
  children: ReactNode;
  empty?: boolean;
  className?: string;
  onOpen?: () => void;
}) {
  return (
    <section
      className={[
        "finance-dashboard__widget",
        "finance-cashflow-view__widget",
        empty ? "finance-dashboard__widget--empty" : null,
        onOpen ? "finance-cashflow-view__widget--interactive" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="finance-dashboard__widget-header">
        <div className="finance-dashboard__widget-title-row">
          {onOpen ? (
            <button
              type="button"
              className="finance-cashflow-view__widget-title-button"
              onClick={onOpen}
            >
              <h2 className="finance-dashboard__widget-title">{title}</h2>
            </button>
          ) : (
            <h2 className="finance-dashboard__widget-title">{title}</h2>
          )}
        </div>
      </header>
      <div
        className="finance-dashboard__widget-body"
        onClick={onOpen}
        onKeyDown={
          onOpen
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpen();
                }
              }
            : undefined
        }
        role={onOpen ? "button" : undefined}
        tabIndex={onOpen ? 0 : undefined}
      >
        {children}
      </div>
    </section>
  );
}

export function FinanceCashflowView({
  cashflow,
  categories,
  loading = false,
  error = null,
  chartMonth = null,
  onChartMonthChange,
  spendPanel,
  spendPanelLoading = false,
  onOpenSpendPanel,
  onCloseSpendPanel,
  onSpendPanelMonthChange,
}: FinanceCashflowViewProps) {
  const latestMonth = localMonthKey();
  const resolvedMonth =
    chartMonth && /^\d{4}-\d{2}$/.test(chartMonth) ? chartMonth : latestMonth;
  const year = cashflow?.year ?? Number(resolvedMonth.slice(0, 4));
  const asOfFallback = useMemo(
    () => formatAsOfIso(asOfForMonthKey(resolvedMonth)),
    [resolvedMonth],
  );
  const asOf = cashflow?.asOf ?? asOfFallback;
  const [spendOpen, setSpendOpen] = useState(false);

  const {
    containerRef,
    detailPaneRef,
    detailWidth,
    isResized: detailResized,
    beginResize: beginDetailResize,
    resetWidth: resetDetailWidth,
  } = useFinancePanelResize(FINANCE_CASHFLOW_DETAIL_WIDTH_KEY);

  useEffect(() => {
    if (!spendOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSpendOpen(false);
        onCloseSpendPanel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCloseSpendPanel, spendOpen]);

  const openSpend = () => {
    setSpendOpen(true);
    onOpenSpendPanel(resolvedMonth);
  };

  const closeSpend = () => {
    setSpendOpen(false);
    onCloseSpendPanel();
  };

  return (
    <EntityDetailLayout sectionLabel="Finance" title="Cash Flow">
      <div
        ref={containerRef}
        className={[
          "finance-cashflow-shell",
          "finance-categories-view",
          spendOpen ? "has-selection" : null,
          detailWidth != null ? "is-detail-resized" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          detailWidth != null
            ? ({ "--finance-cat-detail-w": `${detailWidth}px` } as CSSProperties)
            : undefined
        }
      >
        <div className="finance-categories-view__list-pane">
          <div className="finance-cashflow-view">
            <FinanceMonthNavigator
              month={resolvedMonth}
              latestMonth={latestMonth}
              onChange={onChartMonthChange}
              aria-label="Cash flow month"
              className="finance-dashboard__month-nav"
            />

            {error ? <p className="finance-empty">{error}</p> : null}

            <div className="finance-cashflow-view__grid">
              <CashflowWidget
                title="Net Income"
                className="finance-cashflow-view__widget--net-income"
              >
                {cashflow ? (
                  <NetIncomeYearChart
                    key={resolvedMonth}
                    year={cashflow.year}
                    asOf={cashflow.asOf}
                    months={cashflow.months}
                    ytdNetCents={cashflow.ytdNetCents}
                    priorYtdNetCents={cashflow.priorYtdNetCents}
                    loading={loading}
                    onMonthSelect={onChartMonthChange}
                  />
                ) : (
                  <NetIncomeYearChart
                    key={resolvedMonth}
                    year={year}
                    asOf={asOf}
                    months={[]}
                    ytdNetCents={0}
                    priorYtdNetCents={0}
                    loading={loading}
                    onMonthSelect={onChartMonthChange}
                  />
                )}
              </CashflowWidget>

              <CashflowWidget
                title="Spending"
                className="finance-cashflow-view__widget--half"
                onOpen={openSpend}
              >
                <CashflowSpendYearChart
                  key={resolvedMonth}
                  year={year}
                  asOf={asOf}
                  categoryMonths={cashflow?.categoryMonths ?? []}
                  categories={categories}
                  ytdExpenseCents={cashflow?.ytdExpenseCents ?? 0}
                  priorYtdExpenseCents={cashflow?.priorYtdExpenseCents ?? 0}
                  loading={loading}
                  onMonthSelect={onChartMonthChange}
                />
              </CashflowWidget>

              <CashflowWidget
                title="Income"
                className="finance-cashflow-view__widget--half"
              >
                <CashflowIncomeYearChart
                  key={resolvedMonth}
                  year={year}
                  asOf={asOf}
                  months={cashflow?.months ?? []}
                  ytdIncomeCents={cashflow?.ytdIncomeCents ?? 0}
                  priorYtdIncomeCents={cashflow?.priorYtdIncomeCents ?? 0}
                  loading={loading}
                  onMonthSelect={onChartMonthChange}
                />
              </CashflowWidget>
            </div>
          </div>
        </div>

        {spendOpen ? (
          <div
            className="finance-categories-view__resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize spend panel"
            onPointerDown={(event) => {
              event.preventDefault();
              beginDetailResize(event.clientX);
            }}
            onDoubleClick={resetDetailWidth}
          />
        ) : null}

        <div
          ref={detailPaneRef}
          className="finance-categories-view__detail-pane"
          data-resized={detailResized ? "true" : undefined}
        >
          {spendOpen ? (
            <FinanceSpendSidePanel
              panel={spendPanel}
              categories={categories}
              loading={spendPanelLoading}
              onClose={closeSpend}
              onSelectMonth={onSpendPanelMonthChange}
            />
          ) : null}
        </div>
      </div>
    </EntityDetailLayout>
  );
}

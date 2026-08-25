"use client";

import type {
  CashflowPlannerEntry,
  CashflowPlannerEntryInput,
  FinanceSpendPanel,
  FinancialCategory,
  WorkspaceCashflow,
} from "@backsteros/contracts";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  CashflowIncomeYearChart,
  CashflowSpendYearChart,
} from "./cashflow-spend-income-charts.js";
import { CashflowPlannerScratchpad } from "./cashflow-planner-scratchpad.js";
import { EntityDetailLayout } from "../entity/entity-detail-layout.js";
import {
  asOfForMonthKey,
  FinanceMonthNavigator,
  localMonthKey,
} from "./finance-month-navigator.js";
import { FinanceSpendSidePanel } from "./finance-spend-side-panel.js";
import { NetIncomeYearChart } from "./net-income-year-chart.js";
import { ProjectsSidePanelIcon } from "../codebase/projects-side-panel-icon.js";
import { ResizableSidePanel } from "../shell/resizable-side-panel.js";
import { shouldHandleGlobalShortcut } from "../../shortcuts/shortcut-guards.js";

const FINANCE_CASHFLOW_PLANNER_WIDTH_KEY =
  "backsteros-desktop.finance-cashflow-planner-width";
const FINANCE_CASHFLOW_PLANNER_OPEN_KEY =
  "backsteros-desktop.finance-cashflow-planner-open";

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
  plannerEntries?: CashflowPlannerEntry[];
  plannerLoading?: boolean;
  plannerPending?: boolean;
  plannerError?: string | null;
  onCreatePlannerEntry?: (
    input?: Partial<CashflowPlannerEntryInput>,
  ) => Promise<unknown>;
  onUpdatePlannerEntry?: (
    id: string,
    patch: Partial<CashflowPlannerEntryInput>,
  ) => Promise<unknown>;
  onReorderPlannerEntries?: (
    patches: Array<{ id: string; patch: Partial<CashflowPlannerEntryInput> }>,
  ) => Promise<unknown>;
  onDeletePlannerEntry?: (id: string) => Promise<unknown>;
};

function formatAsOfIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function readPlannerOpenPreference(): boolean {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(FINANCE_CASHFLOW_PLANNER_OPEN_KEY);
  if (stored == null) return true;
  return stored === "1" || stored === "true";
}

/** Plain ] toggles the right planner panel (same as journal day timeline). */
function isPlannerPanelToggleShortcut(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return false;
  }
  return event.key === "]" || event.code === "BracketRight";
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
  plannerEntries = [],
  plannerLoading = false,
  plannerPending = false,
  plannerError = null,
  onCreatePlannerEntry,
  onUpdatePlannerEntry,
  onReorderPlannerEntries,
  onDeletePlannerEntry,
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
  const [plannerOpen, setPlannerOpen] = useState(readPlannerOpenPreference);

  const hasPlanner =
    Boolean(onCreatePlannerEntry) &&
    Boolean(onUpdatePlannerEntry) &&
    Boolean(onDeletePlannerEntry);

  const panelCollapsed = hasPlanner && !plannerOpen && !spendOpen;
  const panelExpanded = spendOpen || (hasPlanner && plannerOpen);

  useEffect(() => {
    if (!hasPlanner) return;
    window.localStorage.setItem(
      FINANCE_CASHFLOW_PLANNER_OPEN_KEY,
      plannerOpen ? "1" : "0",
    );
  }, [hasPlanner, plannerOpen]);

  const showPlanner = useCallback(() => {
    setPlannerOpen(true);
  }, []);

  const hidePlanner = useCallback(() => {
    if (spendOpen) {
      setSpendOpen(false);
      onCloseSpendPanel();
    }
    setPlannerOpen(false);
  }, [onCloseSpendPanel, spendOpen]);

  const togglePlanner = useCallback(() => {
    if (spendOpen) {
      setSpendOpen(false);
      onCloseSpendPanel();
      setPlannerOpen(true);
      return;
    }
    setPlannerOpen((current) => !current);
  }, [onCloseSpendPanel, spendOpen]);

  useEffect(() => {
    if (!hasPlanner) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (!isPlannerPanelToggleShortcut(event)) return;
      if (!shouldHandleGlobalShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      togglePlanner();
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [hasPlanner, togglePlanner]);

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
    setPlannerOpen(true);
    onOpenSpendPanel(resolvedMonth);
  };

  const closeSpend = () => {
    setSpendOpen(false);
    onCloseSpendPanel();
  };

  const charts = (
    <div className="finance-cashflow-view">
      <FinanceMonthNavigator
        month={resolvedMonth}
        latestMonth={latestMonth}
        onChange={onChartMonthChange}
        aria-label="Cash flow month"
        className="finance-dashboard__month-nav"
      />

      {error ? <p className="finance-empty">{error}</p> : null}

      <div className="finance-cashflow-view__body">
        <div className="finance-cashflow-view__charts">
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
    </div>
  );

  if (!hasPlanner && !spendOpen) {
    return (
      <EntityDetailLayout sectionLabel="Finance" title="Cash Flow">
        <div className="finance-cashflow-shell">{charts}</div>
      </EntityDetailLayout>
    );
  }

  return (
    <EntityDetailLayout sectionLabel="Finance" title="Cash Flow">
      <div
        className={[
          "finance-cashflow-shell",
          "journal-day-layout",
          "desktop-journal-day-layout",
          panelCollapsed ? "is-calendar-collapsed" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        data-content-detail
        data-detail-split
        data-calendar-collapsed={panelCollapsed ? "true" : "false"}
      >
        <div className="journal-day-layout__main">{charts}</div>

        {panelCollapsed ? (
          <aside
            className="journal-day-layout__calendar is-collapsed"
            aria-label="Planner"
          >
            <button
              type="button"
              className="desktop-terminal-strip"
              title="Show planner (])"
              aria-label="Show planner"
              onClick={showPlanner}
            >
              <ProjectsSidePanelIcon size={16} collapsed rail="end" />
            </button>
          </aside>
        ) : panelExpanded ? (
          <ResizableSidePanel
            storageKey={FINANCE_CASHFLOW_PLANNER_WIDTH_KEY}
            defaultWidth={320}
            minWidth={260}
            maxWidth={640}
            edge="start"
            className="journal-day-layout__calendar finance-cashflow-planner-rail"
          >
            <div className="desktop-journal-day-layout__chrome">
              <div className="desktop-agent-surface-tab-actions">
                <button
                  type="button"
                  className="desktop-agent-surface-tab desktop-agent-surface-tab--icon"
                  onClick={hidePlanner}
                  title="Hide planner (])"
                  aria-label="Hide planner"
                >
                  <ProjectsSidePanelIcon
                    size={16}
                    collapsed={false}
                    rail="end"
                  />
                </button>
              </div>
            </div>
            <div className="desktop-journal-day-layout__calendar-body">
              {spendOpen ? (
                <FinanceSpendSidePanel
                  panel={spendPanel}
                  categories={categories}
                  loading={spendPanelLoading}
                  onClose={closeSpend}
                  onSelectMonth={onSpendPanelMonthChange}
                />
              ) : (
                <div className="finance-cashflow-planner-panel">
                  <CashflowPlannerScratchpad
                    entries={plannerEntries}
                    loading={plannerLoading}
                    pending={plannerPending}
                    error={plannerError}
                    onCreate={onCreatePlannerEntry!}
                    onUpdate={onUpdatePlannerEntry!}
                    onReorder={onReorderPlannerEntries}
                    onDelete={onDeletePlannerEntry!}
                  />
                </div>
              )}
            </div>
          </ResizableSidePanel>
        ) : null}
      </div>
    </EntityDetailLayout>
  );
}

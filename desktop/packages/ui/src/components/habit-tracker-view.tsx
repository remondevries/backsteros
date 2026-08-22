"use client";

import type { Habit, HabitCadence } from "@backsteros/contracts";
import { SortDescIcon, SyncIcon } from "@primer/octicons-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  Fragment,
  type ReactNode,
} from "react";

import { DOCUMENT_CONTENT_MAX_WIDTH } from "../documents/document-editor-theme.js";
import {
  HABIT_CADENCE_OPTIONS,
  getHabitCadenceLabel,
  parseHabitCadence,
  resolveNextHabitDueYmd,
} from "../habits/habit-cadence.js";
import {
  buildHabitTimelineGrids,
  earliestHabitInstanceYmd,
  focusYmdForHabitSort,
  habitInstanceCounts,
  type HabitDayHeat,
  type HabitGridCell,
  type HabitGridInstance,
  type HabitMonthGrid,
  type HabitSortGranularity,
} from "../habits/habit-month-grid.js";
import {
  HABIT_SORT_OPTIONS,
  getHabitSortLabel,
  parseHabitSort,
} from "../habits/habit-sort.js";
import {
  deriveHabitTimelineMinimapItems,
  habitTimelineSectionId,
  resolveHabitTimelineMinimapHasPersistentGutter,
  resolveHabitTimelineMinimapHitStripWidth,
  type HabitTimelineMinimapItem,
} from "../habits/habit-timeline-minimap.js";
import {
  fireHabitCompleteConfetti,
} from "../habits/habit-complete-confetti.js";
import { formatLocalYmd } from "../tasks/task-due-date.js";
import { HabitDayDeleteConfirmModal } from "./habit-day-delete-confirm-modal.js";
import { HabitTimelineMinimap } from "./habit-timeline-minimap.js";
import {
  FinanceYearNavigator,
  localCalendarYear,
} from "./finance-month-navigator.js";
import { DefaultProjectIcon } from "./default-project-icon.js";
import { OverviewNameEditor } from "./overview-name-editor.js";
import { ProjectOcticon } from "./project-octicon.js";
import { ProjectOverviewIcon } from "./project-overview-icon.js";
import { PropertyDropdown } from "./property-dropdown.js";
import { TaskDueDateDropdown } from "./task-due-date-dropdown.js";
import { Tooltip } from "./tooltip.js";

export type HabitDayRecordStatus = "completed" | "canceled";

export type HabitTrackerProjectOption = {
  id: string;
  name: string;
  icon?: string | null;
  type?: string | null;
};

export type HabitTrackerViewProps = {
  habit: Habit | null;
  instances: readonly HabitGridInstance[];
  todayYmd: string;
  /** Projects available for filing habit day tasks (Health is the default). */
  projects?: readonly HabitTrackerProjectOption[];
  onCadenceChange?: (cadence: HabitCadence) => void;
  onProjectChange?: (projectId: string) => void;
  onIconChange?: (icon: string | null) => void | Promise<void>;
  onTitleChange?: (
    title: string,
  ) =>
    | Promise<{ ok: true } | { ok: false; error: string }>
    | { ok: true }
    | { ok: false; error: string };
  onDescriptionChange?: (description: string | null) => void | Promise<void>;
  /** Reschedule the habit's current open day task (today or future YMD). */
  onNextDueChange?: (nextDueYmd: string) => void | Promise<void>;
  onRecordDay?: (input: {
    dueYmd: string;
    status: HabitDayRecordStatus;
  }) => Promise<void> | void;
  onDeleteDay?: (input: {
    taskId: string;
    dueYmd: string;
  }) => Promise<void> | void;
};

function cellTitle(cell: HabitGridCell): string {
  const base = cell.title ?? cell.ymd;
  if (cell.state === "heat" && cell.heat) {
    const { completed, canceled, tone } = cell.heat;
    if (tone === "mixed") {
      return `${base} · ${completed} completed · ${canceled} missed`;
    }
    if (tone === "completed") {
      return `${base} · ${completed} completed`;
    }
    return `${base} · ${canceled} missed`;
  }
  if (cell.state === "completed") return `${base} · completed`;
  if (cell.state === "canceled") return `${base} · missed`;
  if (cell.state === "scheduled") return `${base} · upcoming due`;
  if (cell.state === "future") return `${base} · inactive`;
  return base;
}

function cellLabel(cell: HabitGridCell): string {
  const base = cell.title ?? cell.ymd;
  if (cell.state === "heat" && cell.heat) {
    const { completed, canceled, tone } = cell.heat;
    if (tone === "mixed") {
      return `${base}, ${completed} completed, ${canceled} missed`;
    }
    if (tone === "completed") return `${base}, ${completed} completed`;
    return `${base}, ${canceled} missed`;
  }
  if (cell.state === "completed") return `${base}, completed`;
  if (cell.state === "canceled") return `${base}, missed`;
  if (cell.state === "scheduled") return `${base}, upcoming due`;
  if (cell.state === "future") return `${base}, inactive`;
  return `${base}, no result`;
}

function HabitDayHeatTooltipContent({
  ymd,
  heat,
}: {
  ymd: string;
  heat: HabitDayHeat;
}) {
  return (
    <div className="habit-tracker-heat-tooltip">
      <div className="habit-tracker-heat-tooltip__date">{ymd}</div>
      <ul className="habit-tracker-heat-tooltip__list">
        {heat.entries.map((entry, index) => (
          <li
            key={`${entry.status}:${entry.title}:${index}`}
            className="habit-tracker-heat-tooltip__row"
          >
            <span
              className={`habit-tracker-heat-tooltip__swatch habit-tracker-heat-tooltip__swatch--${entry.status}`}
              aria-hidden
            />
            <span className="habit-tracker-heat-tooltip__title">
              {entry.title}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Allow browsing empty years far before/after any habit data. */
const HABIT_YEAR_NAV_EARLIEST = 1970;
const HABIT_YEAR_NAV_FUTURE_SPAN = 25;

function HabitControlDropdown<T extends string>({
  value,
  options,
  onChange,
  disabled,
  searchPlaceholder,
  ariaLabel,
  fallbackIcon,
  fallbackLabel,
  panelWidth = 220,
}: {
  value: T;
  options: ReadonlyArray<{
    value: T;
    label: string;
    icon?: ReactNode;
    searchTerms?: string;
  }>;
  onChange?: (value: T) => void;
  disabled?: boolean;
  searchPlaceholder: string;
  ariaLabel: string;
  fallbackIcon: ReactNode;
  fallbackLabel: string;
  panelWidth?: number;
}) {
  return (
    <PropertyDropdown
      value={value}
      options={[...options]}
      onChange={(next) => onChange?.(next)}
      disabled={disabled || !onChange}
      searchPlaceholder={searchPlaceholder}
      ariaLabel={ariaLabel}
      fallbackIcon={fallbackIcon}
      fallbackLabel={fallbackLabel}
      panelWidth={panelWidth}
      panelAlign="end"
      triggerVariant="inlineChip"
    />
  );
}

function resolveHabitProject(
  habit: Habit,
  projects: readonly HabitTrackerProjectOption[],
): HabitTrackerProjectOption | null {
  if (habit.projectId) {
    const match = projects.find((project) => project.id === habit.projectId);
    if (match) return match;
  }
  return (
    projects.find((project) => project.name.trim().toLowerCase() === "health") ??
    projects[0] ??
    null
  );
}

function isRecordedCellState(
  state: HabitGridCell["state"],
): state is "completed" | "canceled" {
  return state === "completed" || state === "canceled";
}

const WEEKDAY_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

function weekdayShortFromYmd(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return "";
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return WEEKDAY_SHORT[date.getUTCDay()] ?? "";
}

function HabitCellDateMarks({
  ymd,
  day,
}: {
  ymd: string;
  day: number;
}) {
  const weekday = weekdayShortFromYmd(ymd);
  return (
    <span className="habit-tracker-cell__marks" aria-hidden="true">
      {weekday ? (
        <span className="habit-tracker-cell__weekday">{weekday}</span>
      ) : null}
      <span className="habit-tracker-cell__daynum">{day}</span>
    </span>
  );
}

function canChooseHabitDay(
  cell: HabitGridCell,
  todayYmd: string,
  interactive: boolean,
): boolean {
  if (!interactive) return false;
  if (cell.ymd > todayYmd) return false;
  return cell.state === "empty";
}

function canDeleteHabitDay(
  cell: HabitGridCell,
  todayYmd: string,
  interactive: boolean,
  taskId: string | null | undefined,
): boolean {
  if (!interactive || !taskId) return false;
  if (cell.ymd > todayYmd) return false;
  return isRecordedCellState(cell.state);
}

function HabitMonthSections({
  grids,
  focusYmd,
  todayYmd,
  todayCellRef,
  contentRootRef,
  sort,
  interactive,
  taskIdByYmd,
  choosingYmd,
  closingYmd,
  onOpenChoice,
  onChooseStatus,
  onRequestDelete,
}: {
  grids: readonly HabitMonthGrid[];
  focusYmd: string;
  todayYmd: string;
  todayCellRef: React.RefObject<HTMLLIElement | null>;
  contentRootRef: React.RefObject<HTMLElement | null>;
  sort: HabitSortGranularity;
  interactive: boolean;
  taskIdByYmd: ReadonlyMap<string, string>;
  choosingYmd: string | null;
  closingYmd: string | null;
  onOpenChoice: (ymd: string) => void;
  onChooseStatus: (
    ymd: string,
    status: HabitDayRecordStatus,
  ) => void | Promise<void>;
  onRequestDelete: (ymd: string, taskId: string) => void;
}) {
  // Future periods toward the top, past toward the bottom.
  const timeline = useMemo(() => [...grids].reverse(), [grids]);
  const gridClass =
    sort === "monthly"
      ? "habit-tracker-month__grid"
      : `habit-tracker-month__grid habit-tracker-month__grid--${sort}`;
  const [optimisticByYmd, setOptimisticByYmd] = useState<
    Partial<Record<string, HabitDayRecordStatus>>
  >({});
  const [pickingByYmd, setPickingByYmd] = useState<
    Partial<Record<string, HabitDayRecordStatus>>
  >({});
  const resolvingYmdsRef = useRef(new Set<string>());

  useEffect(() => {
    setOptimisticByYmd((current) => {
      const keys = Object.keys(current);
      if (keys.length === 0) return current;
      const next = { ...current };
      let changed = false;
      for (const grid of grids) {
        for (const cell of grid.cells) {
          const pending = next[cell.ymd];
          if (pending && cell.state === pending) {
            delete next[cell.ymd];
            changed = true;
          }
        }
      }
      return changed ? next : current;
    });
  }, [grids]);

  const handlePickStatus = useCallback(
    (ymd: string, status: HabitDayRecordStatus, square: Element | null) => {
      if (resolvingYmdsRef.current.has(ymd)) return;
      resolvingYmdsRef.current.add(ymd);
      setPickingByYmd((current) => ({ ...current, [ymd]: status }));
      if (status === "completed" && square) {
        fireHabitCompleteConfetti(square, contentRootRef.current);
      }
      // Let the expand animation finish before snapping to the solid fill.
      window.setTimeout(() => {
        setOptimisticByYmd((current) => ({ ...current, [ymd]: status }));
        setPickingByYmd((current) => {
          if (!(ymd in current)) return current;
          const next = { ...current };
          delete next[ymd];
          return next;
        });
        void Promise.resolve(onChooseStatus(ymd, status))
          .catch(() => {
            setOptimisticByYmd((current) => {
              if (!(ymd in current)) return current;
              const next = { ...current };
              delete next[ymd];
              return next;
            });
          })
          .finally(() => {
            resolvingYmdsRef.current.delete(ymd);
          });
      }, 280);
    },
    [contentRootRef, onChooseStatus],
  );

  return (
    <div className="habit-tracker__months">
      {timeline.map((grid) => {
        const sectionId = habitTimelineSectionId(grid);
        return (
          <section
            key={sectionId}
            className="habit-tracker-month"
            data-habit-section={sectionId}
            data-habit-month={`${grid.year}-${String(grid.month).padStart(2, "0")}`}
          >
            <div className="habit-tracker-month__header">
              <h2 className="habit-tracker-month__label">{grid.label}</h2>
              {grid.secondaryLabel ? (
                <span className="habit-tracker-month__secondary">
                  {grid.secondaryLabel}
                </span>
              ) : null}
            </div>
            <ol className={gridClass} aria-label={grid.label}>
              {[...grid.cells].reverse().map((cell) => {
                const isFocus = cell.ymd === focusYmd || cell.id === focusYmd;
                const taskId = taskIdByYmd.get(cell.ymd) ?? null;
                const optimistic = optimisticByYmd[cell.ymd];
                const pickStatus = pickingByYmd[cell.ymd];
                const displayState = optimistic ?? cell.state;
                const choosing =
                  !optimistic &&
                  (choosingYmd === cell.ymd || closingYmd === cell.ymd);
                const choiceClosing = closingYmd === cell.ymd;
                const displayCell =
                  optimistic && displayState !== cell.state
                    ? { ...cell, state: displayState }
                    : cell;
                const choosable = canChooseHabitDay(
                  displayCell,
                  todayYmd,
                  interactive,
                );
                const deletable = canDeleteHabitDay(
                  displayCell,
                  todayYmd,
                  interactive,
                  taskId,
                );
                const className = [
                  "habit-tracker-cell",
                  `habit-tracker-cell--${displayState}`,
                  displayState === "heat" && cell.heat
                    ? `habit-tracker-cell--heat-${cell.heat.tone} habit-tracker-cell--heat-l${cell.heat.level}`
                    : "",
                  isFocus ? "habit-tracker-cell--today" : "",
                  choosing ? "habit-tracker-cell--choosing" : "",
                  choosable || deletable ? "habit-tracker-cell--interactive" : "",
                ]
                  .filter(Boolean)
                  .join(" ");

                const heatTooltip =
                  displayState === "heat" &&
                  cell.heat &&
                  cell.heat.entries.length > 0 ? (
                    <HabitDayHeatTooltipContent
                      ymd={cell.ymd}
                      heat={cell.heat}
                    />
                  ) : null;

                const cellNode = (
                  <li
                    ref={isFocus ? todayCellRef : undefined}
                    className={className}
                    title={
                      heatTooltip || choosing
                        ? undefined
                        : cellTitle(displayCell)
                    }
                    data-habit-ymd={cell.ymd}
                  >
                    <HabitCellDateMarks ymd={cell.ymd} day={cell.day} />
                    {choosing ? (
                      <div
                        className={[
                          "habit-tracker-cell__choice",
                          pickStatus
                            ? `habit-tracker-cell__choice--pick-${pickStatus}`
                            : "",
                          choiceClosing
                            ? "habit-tracker-cell__choice--closing"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        role="group"
                      >
                        <button
                          type="button"
                          className="habit-tracker-cell__half habit-tracker-cell__half--complete"
                          aria-label={`Mark ${cell.ymd} completed`}
                          disabled={Boolean(pickStatus) || choiceClosing}
                          onClick={(event) => {
                            event.stopPropagation();
                            const square = event.currentTarget.closest(
                              "[data-habit-ymd]",
                            );
                            handlePickStatus(cell.ymd, "completed", square);
                          }}
                        />
                        <button
                          type="button"
                          className="habit-tracker-cell__half habit-tracker-cell__half--skip"
                          aria-label={`Mark ${cell.ymd} skipped`}
                          disabled={Boolean(pickStatus) || choiceClosing}
                          onClick={(event) => {
                            event.stopPropagation();
                            const square = event.currentTarget.closest(
                              "[data-habit-ymd]",
                            );
                            handlePickStatus(cell.ymd, "canceled", square);
                          }}
                        />
                      </div>
                    ) : choosable ? (
                      <button
                        type="button"
                        className="habit-tracker-cell__action"
                        aria-label={`Record ${cell.ymd}`}
                        onClick={() => onOpenChoice(cell.ymd)}
                      >
                        <span className="visually-hidden">
                          {cellLabel(displayCell)}
                        </span>
                      </button>
                    ) : deletable && taskId ? (
                      <button
                        type="button"
                        className="habit-tracker-cell__action"
                        aria-label={`Delete habit day ${cell.ymd}`}
                        onClick={() => onRequestDelete(cell.ymd, taskId)}
                      >
                        <span className="visually-hidden">
                          {cellLabel(displayCell)}
                        </span>
                      </button>
                    ) : (
                      <span className="visually-hidden">
                        {cellLabel(displayCell)}
                      </span>
                    )}
                  </li>
                );

                return heatTooltip ? (
                  <Tooltip
                    key={cell.id}
                    label={cellTitle(displayCell)}
                    content={heatTooltip}
                    openDelay={200}
                    className="habit-tracker-heat-tooltip-root"
                  >
                    {cellNode}
                  </Tooltip>
                ) : (
                  <Fragment key={cell.id}>{cellNode}</Fragment>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

function HabitTrackerShell({
  yearNavigator,
  heading,
  controls,
  sortControl,
  grids,
  focusYmd,
  todayYmd,
  sort,
  scrollAnchorKey,
  interactive,
  taskIdByYmd,
  choosingYmd,
  closingYmd,
  onOpenChoice,
  onChooseStatus,
  onRequestDelete,
}: {
  yearNavigator: ReactNode;
  heading: ReactNode;
  controls: ReactNode;
  sortControl: ReactNode;
  grids: readonly HabitMonthGrid[];
  focusYmd: string;
  todayYmd: string;
  sort: HabitSortGranularity;
  /** Only re-center when this changes (habit / sort / year), not on data refresh. */
  scrollAnchorKey: string;
  interactive: boolean;
  taskIdByYmd: ReadonlyMap<string, string>;
  choosingYmd: string | null;
  closingYmd: string | null;
  onOpenChoice: (ymd: string) => void;
  onChooseStatus: (
    ymd: string,
    status: HabitDayRecordStatus,
  ) => void | Promise<void>;
  onRequestDelete: (ymd: string, taskId: string) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayCellRef = useRef<HTMLLIElement | null>(null);
  const minimapItems = useMemo(
    () => deriveHabitTimelineMinimapItems(grids),
    [grids],
  );
  const [hasPersistentGutter, setHasPersistentGutter] = useState(false);
  const [hitStripWidth, setHitStripWidth] = useState(0);
  const [inViewIds, setInViewIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const target = todayCellRef.current;
    if (!scroller || !target) return;

    const scrollerRect = scroller.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const delta =
      targetRect.top +
      targetRect.height / 2 -
      (scrollerRect.top + scrollerRect.height / 2);
    scroller.scrollTop += delta;
  }, [scrollAnchorKey, focusYmd, sort]);

  const updateMinimapInView = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller || minimapItems.length === 0) {
      setInViewIds(new Set());
      return;
    }
    const scrollerRect = scroller.getBoundingClientRect();
    const next = new Set<string>();
    for (const item of minimapItems) {
      const section = scroller.querySelector<HTMLElement>(
        `[data-habit-section="${CSS.escape(item.id)}"]`,
      );
      if (!section) continue;
      const rect = section.getBoundingClientRect();
      if (rect.bottom > scrollerRect.top && rect.top < scrollerRect.bottom) {
        next.add(item.id);
      }
    }
    setInViewIds((current) => {
      if (current.size === next.size) {
        let same = true;
        for (const id of next) {
          if (!current.has(id)) {
            same = false;
            break;
          }
        }
        if (same) return current;
      }
      return next;
    });
  }, [minimapItems]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;

    const syncGutter = () => {
      const width = body.getBoundingClientRect().width;
      setHasPersistentGutter(resolveHabitTimelineMinimapHasPersistentGutter(width));
      setHitStripWidth(resolveHabitTimelineMinimapHitStripWidth(width));
    };

    syncGutter();
    const observer = new ResizeObserver(syncGutter);
    observer.observe(body);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    updateMinimapInView();
    const onScroll = () => updateMinimapInView();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    const frame = requestAnimationFrame(updateMinimapInView);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [updateMinimapInView, scrollAnchorKey, grids.length]);

  const jumpToSection = useCallback((item: HabitTimelineMinimapItem) => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const section = scroller.querySelector<HTMLElement>(
      `[data-habit-section="${CSS.escape(item.id)}"]`,
    );
    if (!section) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();
    scroller.scrollTop += sectionRect.top - scrollerRect.top - 12;
  }, []);

  return (
    <div className="habit-tracker" data-habit-tracker>
      <header className="habit-tracker__header">
        <div
          className="habit-tracker__column"
          style={{ maxWidth: DOCUMENT_CONTENT_MAX_WIDTH }}
        >
          <div className="habit-tracker__header-row">
            <div className="habit-tracker__heading">{heading}</div>
            <div className="habit-tracker__year-slot">{yearNavigator}</div>
            <div className="habit-tracker__controls">
              {controls}
            </div>
            <div className="habit-tracker__sort-slot">{sortControl}</div>
          </div>
        </div>
        <div className="habit-tracker__fade" aria-hidden="true" />
      </header>
      <div className="habit-tracker__body" ref={bodyRef}>
        <HabitTimelineMinimap
          items={minimapItems}
          hasPersistentGutter={hasPersistentGutter}
          hitStripWidth={hitStripWidth}
          inViewIds={inViewIds}
          onSelect={jumpToSection}
        />
        <div className="habit-tracker__scroll" ref={scrollRef}>
          <div
            className="habit-tracker__column"
            style={{ maxWidth: DOCUMENT_CONTENT_MAX_WIDTH }}
          >
            <HabitMonthSections
              grids={grids}
              focusYmd={focusYmd}
              todayYmd={todayYmd}
              todayCellRef={todayCellRef}
              contentRootRef={scrollRef}
              sort={sort}
              interactive={interactive}
              taskIdByYmd={taskIdByYmd}
              choosingYmd={choosingYmd}
              closingYmd={closingYmd}
              onOpenChoice={onOpenChoice}
              onChooseStatus={onChooseStatus}
              onRequestDelete={onRequestDelete}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function HabitDescriptionEditor({
  value,
  resetKey,
  onSave,
}: {
  value: string | null;
  resetKey: string;
  onSave: (description: string | null) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const syncKey = `${resetKey}|${value ?? ""}`;
  const [prevSyncKey, setPrevSyncKey] = useState(syncKey);
  if (syncKey !== prevSyncKey) {
    setPrevSyncKey(syncKey);
    setDraft(value ?? "");
  }

  const commit = useCallback(() => {
    const next = draft.trim() || null;
    const current = value?.trim() || null;
    if (next === current) {
      setDraft(value ?? "");
      return;
    }
    void onSave(next);
  }, [draft, onSave, value]);

  return (
    <textarea
      className="habit-tracker__description"
      value={draft}
      rows={Math.min(8, Math.max(2, draft.split("\n").length + (draft ? 0 : 1)))}
      placeholder="Add a description…"
      aria-label="Habit description"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
    />
  );
}

export function HabitTrackerView({
  habit,
  instances,
  todayYmd,
  projects = [],
  onCadenceChange,
  onProjectChange,
  onIconChange,
  onTitleChange,
  onDescriptionChange,
  onNextDueChange,
  onRecordDay,
  onDeleteDay,
}: HabitTrackerViewProps) {
  const currentCalendarYear = localCalendarYear();
  const earliestYear = HABIT_YEAR_NAV_EARLIEST;
  const latestYear = currentCalendarYear + HABIT_YEAR_NAV_FUTURE_SPAN;
  const activeFromYmd = useMemo(() => {
    if (!habit) {
      return earliestHabitInstanceYmd(instances);
    }
    return (
      earliestHabitInstanceYmd(instances) ??
      (habit.createdAt.slice(0, 10) || null)
    );
  }, [habit, instances]);

  const [year, setYear] = useState(() => currentCalendarYear);
  const [sort, setSort] = useState<HabitSortGranularity>("monthly");
  const [choosingYmd, setChoosingYmd] = useState<string | null>(null);
  const [closingYmd, setClosingYmd] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    taskId: string;
    dueYmd: string;
  } | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const taskIdByYmd = useMemo(() => {
    const map = new Map<string, string>();
    for (const instance of instances) {
      if (instance.taskId) map.set(instance.dueYmd, instance.taskId);
    }
    return map;
  }, [instances]);

  const interactive = Boolean(habit && (onRecordDay || onDeleteDay));

  useEffect(() => {
    setYear((current) => {
      if (current < earliestYear) return earliestYear;
      if (current > latestYear) return latestYear;
      return current;
    });
  }, [earliestYear, latestYear]);

  useEffect(() => {
    setChoosingYmd(null);
    setClosingYmd(null);
    setPendingDelete(null);
    setDeleteError(null);
  }, [habit?.id]);

  const dismissChoice = useCallback(() => {
    setChoosingYmd((current) => {
      if (current) setClosingYmd(current);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!closingYmd) return;
    const timer = window.setTimeout(() => {
      setClosingYmd((current) => (current === closingYmd ? null : current));
    }, 420);
    return () => window.clearTimeout(timer);
  }, [closingYmd]);

  useEffect(() => {
    if (!choosingYmd) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        dismissChoice();
      }
    }
    function onPointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(`[data-habit-ymd="${choosingYmd}"]`)) return;
      dismissChoice();
    }
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [choosingYmd, dismissChoice]);

  const yearNavigator = (
    <FinanceYearNavigator
      year={year}
      latestYear={latestYear}
      earliestYear={earliestYear}
      onChange={setYear}
      aria-label="Habit year"
      className="habit-tracker__year-nav"
    />
  );

  const focusYmd = focusYmdForHabitSort(sort, todayYmd, year);
  const scrollAnchorKey = `${habit?.id ?? "all"}:${sort}:${year}`;
  const cadence = habit ? parseHabitCadence(habit.cadence) : null;
  const cadenceAnchorYmd =
    habit?.cadenceAnchorYmd ??
    (habit ? activeFromYmd : null);
  const grids = buildHabitTimelineGrids({
    instances,
    todayYmd,
    year,
    sort: parseHabitSort(sort),
    activeFromYmd,
    cadence: habit ? cadence : null,
    cadenceAnchorYmd: habit ? cadenceAnchorYmd : null,
    aggregate: !habit,
  });

  const sortControl = (
    <HabitControlDropdown
      value={sort}
      options={HABIT_SORT_OPTIONS}
      onChange={setSort}
      searchPlaceholder="Change sort…"
      ariaLabel={`Sort: ${getHabitSortLabel(sort)}`}
      fallbackIcon={<SortDescIcon size={14} />}
      fallbackLabel={getHabitSortLabel(sort)}
    />
  );

  const selectedProject = habit ? resolveHabitProject(habit, projects) : null;
  const projectOptions = useMemo(
    () =>
      projects.map((project) => ({
        value: project.id,
        label: project.name,
        searchTerms: project.name,
        icon: (
          <ProjectOcticon
            icon={project.icon}
            type={project.type}
            size={14}
            className="text-foreground/70"
          />
        ),
      })),
    [projects],
  );

  const handleOpenChoice = useCallback((ymd: string) => {
    if (!onRecordDay) return;
    setClosingYmd(null);
    setChoosingYmd(ymd);
  }, [onRecordDay]);

  const handleChooseStatus = useCallback(
    (ymd: string, status: HabitDayRecordStatus) => {
      if (!onRecordDay) return;
      setClosingYmd(null);
      setChoosingYmd(null);
      return onRecordDay({ dueYmd: ymd, status });
    },
    [onRecordDay],
  );

  const handleRequestDelete = useCallback(
    (ymd: string, taskId: string) => {
      if (!onDeleteDay) return;
      setClosingYmd(null);
      setChoosingYmd(null);
      setDeleteError(null);
      setPendingDelete({ dueYmd: ymd, taskId });
    },
    [onDeleteDay],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete || !onDeleteDay || deletePending) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      await onDeleteDay(pendingDelete);
      setPendingDelete(null);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Could not delete habit day.",
      );
    } finally {
      setDeletePending(false);
    }
  }, [deletePending, onDeleteDay, pendingDelete]);

  const shellProps = {
    yearNavigator,
    focusYmd,
    todayYmd,
    grids,
    sort,
    scrollAnchorKey,
    interactive,
    taskIdByYmd,
    choosingYmd,
    closingYmd,
    onOpenChoice: handleOpenChoice,
    onChooseStatus: handleChooseStatus,
    onRequestDelete: handleRequestDelete,
  };

  const deleteModal = pendingDelete ? (
    <HabitDayDeleteConfirmModal
      dueYmd={pendingDelete.dueYmd}
      deleting={deletePending}
      error={deleteError}
      onCancel={() => {
        if (deletePending) return;
        setPendingDelete(null);
        setDeleteError(null);
      }}
      onConfirm={() => {
        void handleConfirmDelete();
      }}
    />
  ) : null;

  if (!habit) {
    return (
      <>
        <HabitTrackerShell
          {...shellProps}
          heading={<h1 className="habit-tracker__title">All</h1>}
          controls={null}
          sortControl={sortControl}
        />
        {deleteModal}
      </>
    );
  }

  const counts = habitInstanceCounts(instances);
  const nextDueYmd = habit
    ? resolveNextHabitDueYmd({
        cadence: cadence ?? "daily",
        cadenceAnchorYmd: cadenceAnchorYmd ?? activeFromYmd ?? todayYmd,
        instances,
        todayYmd,
      })
    : todayYmd;

  return (
    <>
      <HabitTrackerShell
        {...shellProps}
        heading={
          <>
            <ProjectOverviewIcon
              icon={habit.icon}
              name={habit.title}
              size={16}
              onIconChange={onIconChange}
            />
            {onTitleChange ? (
              <OverviewNameEditor
                value={habit.title}
                entityLabel="Habit"
                resetKey={habit.id}
                titleClassName="habit-tracker__title"
                onSave={onTitleChange}
              />
            ) : (
              <h1 className="habit-tracker__title">{habit.title}</h1>
            )}
            <p className="habit-tracker__counts">
              {counts.completed} completed · {counts.canceled} missed
            </p>
            {onDescriptionChange ? (
              <HabitDescriptionEditor
                value={habit.description}
                resetKey={habit.id}
                onSave={onDescriptionChange}
              />
            ) : habit.description ? (
              <p className="habit-tracker__description habit-tracker__description--readonly">
                {habit.description}
              </p>
            ) : null}
          </>
        }
        controls={
          <>
            <HabitControlDropdown
              value={cadence ?? "daily"}
              options={HABIT_CADENCE_OPTIONS}
              onChange={onCadenceChange}
              disabled={!onCadenceChange}
              searchPlaceholder="Change due cadence…"
              ariaLabel={`Due cadence: ${getHabitCadenceLabel(cadence ?? "daily")}`}
              fallbackIcon={<SyncIcon size={14} />}
              fallbackLabel={getHabitCadenceLabel(cadence ?? "daily")}
            />
            <TaskDueDateDropdown
              dueDate={nextDueYmd}
              status="ready_to_start"
              variant="property"
              triggerVariant="inlineChip"
              allowClear={false}
              disabled={!onNextDueChange}
              taskPropertyDropdownId={null}
              searchPlaceholder="Change next due…"
              searchShortcutLabel=""
              onDueDateChange={(date) => {
                if (!onNextDueChange || !date) return;
                void onNextDueChange(formatLocalYmd(date));
              }}
            />
            {projectOptions.length > 0 && selectedProject ? (
              <HabitControlDropdown
                value={selectedProject.id}
                options={projectOptions}
                onChange={onProjectChange}
                disabled={!onProjectChange}
                searchPlaceholder="Change project…"
                ariaLabel={`Project: ${selectedProject.name}`}
                fallbackIcon={
                  <ProjectOcticon
                    icon={selectedProject.icon}
                    type={selectedProject.type}
                    size={14}
                  />
                }
                fallbackLabel={selectedProject.name}
                panelWidth={280}
              />
            ) : (
              <HabitControlDropdown
                value="health"
                options={[{ value: "health", label: "Health" }]}
                disabled
                searchPlaceholder="Change project…"
                ariaLabel="Project: Health"
                fallbackIcon={<DefaultProjectIcon size={14} />}
                fallbackLabel="Health"
              />
            )}
          </>
        }
        sortControl={sortControl}
      />
      {deleteModal}
    </>
  );
}

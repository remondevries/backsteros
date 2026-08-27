import type { Habit, HabitCadence } from "@backsteros/contracts";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Alert,
  Dimensions,
  InteractionManager,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Svg, { Rect } from "react-native-svg";
import { useNavigation } from "@react-navigation/native";
import { useRouter } from "expo-router";

import {
  fireHabitCompleteConfetti,
} from "../../lib/habits/habit-complete-confetti";
import {
  getHabitCadenceLabel,
  HABIT_CADENCE_OPTIONS,
  parseHabitCadence,
  resolveNextHabitDueYmd,
} from "../../lib/habits/habit-cadence";
import {
  buildHabitTimelineGrids,
  earliestHabitInstanceYmd,
  focusYmdForHabitSort,
  habitInstanceCounts,
  type HabitDayHeat,
  type HabitGridCell,
  type HabitGridInstance,
  type HabitSortGranularity,
} from "../../lib/habits/habit-month-grid";
import {
  getHabitSortLabel,
  HABIT_SORT_OPTIONS,
  parseHabitSort,
} from "../../lib/habits/habit-sort";
import {
  deriveHabitTimelineMinimapItems,
  habitTimelineSectionId,
} from "../../lib/habits/habit-timeline-minimap";
import { FLOATING_TAB_BAR_CLEARANCE } from "../../lib/tab-bar-inset";
import {
  endOfLocalDayIso,
  formatLocalYmd,
  formatTaskDueMetaLabel,
  parseYmdLocal,
} from "../../lib/task-due-date";
import { colors, spacing } from "../../lib/theme";
import { isPadDevice } from "../../lib/device";
import { TextInput } from "../app-text-input";
import {
  CONTENT_HEADER_FADE_HEIGHT,
  ContentHeaderFade,
} from "../content-header-fade";
import { DetailContentContainer } from "../detail-content-container";
import { DueDatePropertySheet } from "../due-date-property-sheet";
import { EntityIconPickerSheet } from "../entity-icon-picker-sheet";
import { YearNavigator } from "../finance/year-navigator";
import { PrimerOcticon } from "../primer-octicon";
import { ProjectOcticon } from "../project-octicon";
import { ProjectOverviewIcon } from "../project-overview-icon";
import {
  PropertyOptionSheet,
  type PropertyOption,
} from "../property-option-sheet";
import { TaskDueDateIcon } from "../task-due-date-icon";
import { HabitDayChoice } from "./habit-day-choice";
import { HabitDescriptionField } from "./habit-description-field";
import { HabitDetailNavHeader } from "./habits-header";
import { HabitTimelineMinimap } from "./habit-timeline-minimap";

type ControlPicker = "cadence" | "project" | "sort" | "nextDue" | null;

export type HabitDayRecordStatus = "completed" | "canceled";
const HABIT_GREEN = "#3d9a5b";
const HABIT_RED = "#c44a4a";
const HEADER_FADE_HEIGHT = CONTENT_HEADER_FADE_HEIGHT;
const WEEKDAY_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;
/** months paddingLeft + paddingRight — keep in sync with styles.months */
const MONTHS_INSET = spacing.screenX + 28 + spacing.screenX;
const MIN_GRID_WIDTH = 160;

/** Survive remounts (phone pushes) so the first paint already has cell sizes. */
let cachedHabitGridWidth = 0;

function commitGridWidth(
  next: number,
  setGridWidth: (updater: (current: number) => number) => void,
) {
  if (next < MIN_GRID_WIDTH) return;
  // Ignore transient shrinks during stack / split transitions.
  if (cachedHabitGridWidth > 0 && next < cachedHabitGridWidth * 0.85) {
    return;
  }
  cachedHabitGridWidth = next;
  setGridWidth((current) => (current === next ? current : next));
}

function HabitHeatTooltipCard({
  ymd,
  heat,
}: {
  ymd: string;
  heat: HabitDayHeat;
}) {
  return (
    <View style={styles.heatTipCard}>
      <Text style={styles.heatTipDate}>{ymd}</Text>
      <View style={styles.heatTipList}>
        {heat.entries.map((entry, index) => (
          <View
            key={`${entry.status}:${entry.title}:${index}`}
            style={styles.heatTipRow}
          >
            <View
              style={[
                styles.heatTipSwatch,
                entry.status === "completed"
                  ? styles.heatTipSwatchCompleted
                  : styles.heatTipSwatchCanceled,
              ]}
            />
            <Text style={styles.heatTipTitle} numberOfLines={2}>
              {entry.title}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

type ProjectOption = {
  id: string;
  name: string;
  icon?: string | null;
  type?: string | null;
};

type Props = {
  habit: Habit | null;
  instances: readonly HabitGridInstance[];
  todayYmd: string;
  projects?: readonly ProjectOption[];
  onTitleChange?: (title: string) => void | Promise<void>;
  onIconChange?: (icon: string | null) => void | Promise<void>;
  onDescriptionChange?: (description: string | null) => void | Promise<void>;
  onCadenceChange?: (cadence: HabitCadence) => void;
  onProjectChange?: (projectId: string) => void;
  onNextDueChange?: (nextDueYmd: string) => void | Promise<void>;
  onRecordDay?: (input: {
    dueYmd: string;
    status: "completed" | "canceled";
  }) => Promise<void>;
  onDeleteDay?: (input: { taskId: string; dueYmd: string }) => Promise<void>;
};

function weekdayShortFromYmd(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return "";
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return WEEKDAY_SHORT[date.getUTCDay()] ?? "";
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function cellBackground(cell: HabitGridCell): string {
  if (cell.state === "completed") return HABIT_GREEN;
  if (cell.state === "canceled") return HABIT_RED;
  if (cell.state === "heat" && cell.heat) {
    const level = cell.heat.level;
    const tone =
      cell.heat.tone === "canceled"
        ? HABIT_RED
        : cell.heat.tone === "mixed"
          ? "#d97706"
          : HABIT_GREEN;
    const alpha = [0.28, 0.48, 0.72, 1][level - 1] ?? 1;
    return alpha >= 1 ? tone : hexToRgba(tone, alpha);
  }
  return "transparent";
}

/**
 * Past/today empty = solid RN border; future/scheduled = SVG dashed stroke
 * (RN `borderStyle: 'dashed'` mixed with solid siblings breaks fills on iOS).
 */
function cellChrome(
  cell: HabitGridCell,
  isFocus: boolean,
  choosing: boolean,
  isFilled: boolean,
  bg: string,
): {
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  dashed: boolean;
} {
  if (choosing) {
    return {
      backgroundColor: "rgba(255,255,255,0.06)",
      borderColor: "rgba(255,255,255,0.28)",
      borderWidth: 1,
      dashed: false,
    };
  }
  if (isFilled) {
    return {
      backgroundColor: bg,
      borderColor: bg,
      borderWidth: 1,
      dashed: false,
    };
  }
  if (cell.state === "future") {
    return {
      backgroundColor: "transparent",
      borderColor: "transparent",
      borderWidth: 0,
      dashed: true,
    };
  }
  if (cell.state === "scheduled") {
    return {
      backgroundColor: "transparent",
      borderColor: "transparent",
      borderWidth: 0,
      dashed: true,
    };
  }
  return {
    backgroundColor: "transparent",
    borderColor: isFocus ? "rgba(255,255,255,0.55)" : colors.border,
    borderWidth: 1,
    dashed: false,
  };
}

const DashedSquareBorder = memo(function DashedSquareBorder({
  size,
  color,
}: {
  size: number;
  color: string;
}) {
  if (size <= 0) return null;
  const inset = 0.5;
  return (
    <Svg
      width={size}
      height={size}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <Rect
        x={inset}
        y={inset}
        width={Math.max(0, size - inset * 2)}
        height={Math.max(0, size - inset * 2)}
        rx={3.5}
        ry={3.5}
        fill="none"
        stroke={color}
        strokeWidth={1}
        strokeDasharray="3 2.5"
      />
    </Svg>
  );
});

function Chip({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon?: ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        pressed && onPress ? styles.chipPressed : null,
        !onPress ? styles.chipDisabled : null,
      ]}
    >
      {icon ? <View style={styles.chipIcon}>{icon}</View> : null}
      <Text style={styles.chipLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function HabitTrackerPane({
  habit,
  instances,
  todayYmd,
  projects = [],
  onTitleChange,
  onIconChange,
  onDescriptionChange,
  onCadenceChange,
  onProjectChange,
  onNextDueChange,
  onRecordDay,
  onDeleteDay,
}: Props) {
  const isPad = isPadDevice();
  const navigation = useNavigation();
  const router = useRouter();
  const currentYear = Number(todayYmd.slice(0, 4)) || new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  useEffect(() => {
    if (year > currentYear) setYear(currentYear);
  }, [currentYear, year]);
  const [sort, setSort] = useState<HabitSortGranularity>("monthly");
  const [titleDraft, setTitleDraft] = useState(habit?.title ?? "");
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [controlPicker, setControlPicker] = useState<ControlPicker>(null);
  const [choosing, setChoosing] = useState<{
    ymd: string;
    pageX: number;
    pageY: number;
    size: number;
  } | null>(null);

  useEffect(() => {
    setTitleDraft(habit?.title ?? "");
  }, [habit?.id, habit?.title]);

  const commitTitle = useCallback(() => {
    if (!habit || !onTitleChange) return;
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      setTitleDraft(habit.title);
      return;
    }
    if (trimmed === habit.title) return;
    void onTitleChange(trimmed);
  }, [habit, onTitleChange, titleDraft]);

  const [choiceOpen, setChoiceOpen] = useState(false);
  const [optimistic, setOptimistic] = useState<
    Partial<Record<string, "completed" | "canceled">>
  >({});
  const [gridWidth, setGridWidth] = useState(
    () => cachedHabitGridWidth,
  );
  const [viewportHeight, setViewportHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [monthsReady, setMonthsReady] = useState(false);
  const [heatTip, setHeatTip] = useState<{
    ymd: string;
    heat: HabitDayHeat;
    /** Square top-left in window coordinates (from the press event). */
    pageX: number;
    pageY: number;
    width: number;
    height: number;
  } | null>(null);
  const [inViewIds, setInViewIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const scrollRef = useRef<ScrollView>(null);
  const viewportRef = useRef<View>(null);
  const todayHostRef = useRef<View>(null);
  const heatTipYmdRef = useRef<string | null>(null);
  const sectionYRef = useRef(new Map<string, number>());
  const scrollYRef = useRef(0);
  const headerHeightRef = useRef(0);
  const didFocusRef = useRef<string | null>(null);

  const openHeatTip = useCallback(
    (
      ymd: string,
      heat: HabitDayHeat,
      event: GestureResponderEvent,
      size: number,
    ) => {
      setChoiceOpen(false);
      setChoosing(null);
      if (heatTipYmdRef.current === ymd) {
        heatTipYmdRef.current = null;
        setHeatTip(null);
        return;
      }
      const { pageX, pageY, locationX, locationY } = event.nativeEvent;
      heatTipYmdRef.current = ymd;
      // Derive square origin from the press — sync, no measureLayout.
      setHeatTip({
        ymd,
        heat,
        pageX: pageX - (locationX ?? size / 2),
        pageY: pageY - (locationY ?? size / 2),
        width: size,
        height: size,
      });
    },
    [],
  );

  const dismissHeatTip = useCallback(() => {
    heatTipYmdRef.current = null;
    setHeatTip(null);
  }, []);

  const clearChoice = useCallback(() => {
    setChoiceOpen(false);
    setChoosing(null);
  }, []);

  /** Start slide-out; `HabitDayChoice` calls `clearChoice` when finished. */
  const dismissChoice = useCallback(() => {
    setChoiceOpen(false);
  }, []);

  const openChoice = useCallback(
    (ymd: string, event: GestureResponderEvent, size: number) => {
      dismissHeatTip();
      if (choosing?.ymd === ymd && choiceOpen) {
        dismissChoice();
        return;
      }
      const { pageX, pageY, locationX, locationY } = event.nativeEvent;
      setChoosing({
        ymd,
        pageX: pageX - (locationX ?? size / 2),
        pageY: pageY - (locationY ?? size / 2),
        size,
      });
      setChoiceOpen(true);
    },
    [choiceOpen, choosing?.ymd, dismissChoice, dismissHeatTip],
  );

  const activeFromYmd = useMemo(() => {
    if (!habit) return earliestHabitInstanceYmd(instances);
    return (
      earliestHabitInstanceYmd(instances) ??
      habit.createdAt.slice(0, 10) ??
      null
    );
  }, [habit, instances]);

  const cadence = habit ? parseHabitCadence(habit.cadence) : null;
  const cadenceAnchorYmd = habit?.cadenceAnchorYmd ?? activeFromYmd;
  const grids = useMemo(
    () =>
      buildHabitTimelineGrids({
        instances,
        todayYmd,
        year,
        sort: parseHabitSort(sort),
        activeFromYmd,
        cadence: habit ? cadence : null,
        cadenceAnchorYmd: habit ? cadenceAnchorYmd : null,
        aggregate: !habit,
      }),
    [activeFromYmd, cadence, cadenceAnchorYmd, habit, instances, sort, todayYmd, year],
  );

  const timeline = useMemo(() => {
    return [...grids].reverse().map((grid) => ({
      grid,
      sectionId: habitTimelineSectionId(grid),
      cells: [...grid.cells].reverse(),
    }));
  }, [grids]);
  const minimapItems = useMemo(
    () => deriveHabitTimelineMinimapItems(grids),
    [grids],
  );
  const taskIdByYmd = useMemo(() => {
    const map = new Map<string, string>();
    for (const instance of instances) {
      if (instance.taskId) map.set(instance.dueYmd, instance.taskId);
    }
    return map;
  }, [instances]);

  const counts = habitInstanceCounts(instances);
  const nextDueYmd = habit
    ? resolveNextHabitDueYmd({
        cadence: cadence ?? "daily",
        cadenceAnchorYmd: cadenceAnchorYmd ?? todayYmd,
        instances,
        todayYmd,
      })
    : todayYmd;
  const nextDueSelectedIso = useMemo(() => {
    const date = parseYmdLocal(nextDueYmd);
    return date ? endOfLocalDayIso(date) : null;
  }, [nextDueYmd]);
  const selectedProject =
    habit && projects.length > 0
      ? (projects.find((project) => project.id === habit.projectId) ??
        projects.find((project) => project.name.toLowerCase() === "health") ??
        projects[0])
      : null;

  const projectSheetOptions = useMemo<PropertyOption<string>[]>(
    () =>
      projects.map((project) => ({
        value: project.id,
        label: project.name,
        icon: (
          <ProjectOcticon
            icon={project.icon}
            type={project.type}
            size={16}
            color={colors.muted}
          />
        ),
      })),
    [projects],
  );

  const cadenceSheetOptions = useMemo<PropertyOption<HabitCadence>[]>(
    () =>
      HABIT_CADENCE_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
        icon: <TaskDueDateIcon active size={14} />,
      })),
    [],
  );

  const sortSheetOptions = useMemo<PropertyOption<HabitSortGranularity>[]>(
    () =>
      HABIT_SORT_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
        icon: (
          <PrimerOcticon name="sort-desc" size={14} color={colors.muted} />
        ),
      })),
    [],
  );

  const closeControlPicker = useCallback(() => {
    setControlPicker(null);
  }, []);

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    router.replace("/habits");
  }, [navigation, router]);

  const phoneNavHeader = !isPad ? (
    <HabitDetailNavHeader
      onBack={handleBack}
      title={habit?.title ?? "All"}
      icon={habit?.icon}
      year={year}
      maxYear={currentYear}
      onYearChange={setYear}
    />
  ) : null;

  const sortChip = (
    <Chip
      icon={
        <PrimerOcticon name="sort-desc" size={12} color={colors.muted} />
      }
      label={getHabitSortLabel(sort)}
      onPress={() => setControlPicker("sort")}
    />
  );

  const columns = sort === "yearly" ? 14 : 7;
  const gap = sort === "yearly" ? 4 : 8;
  const cellSize =
    gridWidth > 0
      ? Math.floor((gridWidth - gap * (columns - 1)) / columns)
      : 0;

  const focusYmd = focusYmdForHabitSort(sort, todayYmd, year);
  const scrollAnchorKey = `${habit?.id ?? "all"}:${sort}:${year}`;
  const habitKey = habit?.id ?? "all";

  useEffect(() => {
    clearChoice();
    setOptimistic({});
    dismissHeatTip();
  }, [clearChoice, dismissHeatTip, habitKey]);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setMonthsReady(true);
    });
    return () => task.cancel();
  }, []);

  const focusMonthIndex = useMemo(() => {
    const index = timeline.findIndex((entry) =>
      entry.cells.some((cell) => cell.ymd === focusYmd),
    );
    return index >= 0 ? index : Math.floor(timeline.length / 2);
  }, [focusYmd, timeline]);

  const onPaneLayout = useCallback((event: LayoutChangeEvent) => {
    const paneWidth = Math.round(event.nativeEvent.layout.width);
    const paneHeight = Math.round(event.nativeEvent.layout.height);
    setViewportHeight(paneHeight);
    commitGridWidth(paneWidth - MONTHS_INSET, setGridWidth);
  }, []);

  const onMonthsLayout = useCallback((event: LayoutChangeEvent) => {
    // styles.months uses horizontal padding; onLayout width is the outer box.
    commitGridWidth(
      Math.round(event.nativeEvent.layout.width) - MONTHS_INSET,
      setGridWidth,
    );
  }, []);

  const handlePick = useCallback(
    async (ymd: string, status: "completed" | "canceled") => {
      if (!onRecordDay) return;
      setOptimistic((current) => ({ ...current, [ymd]: status }));
      clearChoice();
      if (status === "completed" && choosing) {
        fireHabitCompleteConfetti({
          x: choosing.pageX + choosing.size / 2,
          y: choosing.pageY + choosing.size / 2,
        });
      }
      try {
        await onRecordDay({ dueYmd: ymd, status });
      } catch {
        setOptimistic((current) => {
          const next = { ...current };
          delete next[ymd];
          return next;
        });
      }
    },
    [choosing, clearChoice, onRecordDay],
  );

  const scrollToToday = useCallback(() => {
    const host = todayHostRef.current;
    const viewport = viewportRef.current;
    const scroller = scrollRef.current;
    if (!host || !viewport || !scroller || viewportHeight <= 0) return;
    host.measureInWindow((_x, todayTop, _w, todayHeight) => {
      viewport.measureInWindow((_sx, viewTop, _sw, viewHeight) => {
        const delta =
          todayTop + todayHeight / 2 - (viewTop + viewHeight / 2);
        const nextY = Math.max(0, scrollYRef.current + delta);
        scroller.scrollTo({ y: nextY, animated: false });
        scrollYRef.current = nextY;
      });
    });
  }, [viewportHeight]);

  useEffect(() => {
    if (cellSize <= 0 || viewportHeight <= 0) return;
    const focusKey = `${scrollAnchorKey}:${monthsReady ? "full" : "near"}`;
    if (didFocusRef.current === focusKey) return;
    const t1 = setTimeout(() => {
      scrollToToday();
      didFocusRef.current = focusKey;
    }, 50);
    return () => clearTimeout(t1);
  }, [cellSize, monthsReady, scrollAnchorKey, scrollToToday, viewportHeight]);

  const updateInView = useCallback(
    (scrollY: number) => {
      if (minimapItems.length === 0 || viewportHeight <= 0) {
        setInViewIds(new Set());
        return;
      }
      const viewTop = scrollY;
      const viewBottom = scrollY + viewportHeight;
      const next = new Set<string>();
      for (const item of minimapItems) {
        const top = sectionYRef.current.get(item.id);
        if (top == null) continue;
        const bottom = top + 160;
        if (bottom >= viewTop && top <= viewBottom) next.add(item.id);
      }
      setInViewIds((current) => {
        if (
          current.size === next.size &&
          [...next].every((id) => current.has(id))
        ) {
          return current;
        }
        return next;
      });
    },
    [minimapItems, viewportHeight],
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y;
      scrollYRef.current = y;
      updateInView(y);
      if (heatTipYmdRef.current != null) {
        dismissHeatTip();
      }
      dismissChoice();
    },
    [dismissChoice, dismissHeatTip, updateInView],
  );

  const jumpToSection = useCallback((sectionId: string) => {
    const y = sectionYRef.current.get(sectionId);
    if (y == null) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
  }, []);

  return (
    <View style={styles.shell}>
      {phoneNavHeader}
      <View style={styles.body}>
        <HabitTimelineMinimap
          items={minimapItems}
          inViewIds={inViewIds}
          onSelect={(item) => jumpToSection(item.id)}
        />
        <DetailContentContainer constrained={isPad} fill>
          <View
            ref={viewportRef}
            collapsable={false}
            style={styles.column}
            onLayout={onPaneLayout}
          >
          {headerHeight > 0 ? (
            <View
              pointerEvents="none"
              style={[styles.headerFade, { top: headerHeight - 1 }]}
            >
              <ContentHeaderFade color={colors.background} />
            </View>
          ) : null}
          <ScrollView
            ref={scrollRef}
            style={styles.root}
            contentContainerStyle={styles.content}
            stickyHeaderIndices={[0]}
            scrollEventThrottle={16}
            onScroll={onScroll}
          >
        <View
          style={[styles.header, !isPad ? styles.headerPhone : null]}
          onLayout={(event) => {
            const next = Math.round(event.nativeEvent.layout.height);
            headerHeightRef.current = next;
            setHeaderHeight((current) => (current === next ? current : next));
          }}
        >
          {habit || isPad ? (
            <View
              style={[styles.headerTop, !isPad ? styles.headerTopPhone : null]}
            >
              <View
                style={[styles.heading, !isPad ? styles.headingPhone : null]}
              >
                {habit ? (
                  <>
                    {isPad ? (
                      <>
                        {onIconChange ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Change icon for ${habit.title}`}
                            onPress={() => setIconPickerOpen(true)}
                            hitSlop={8}
                          >
                            <ProjectOverviewIcon icon={habit.icon} size={16} />
                          </Pressable>
                        ) : (
                          <ProjectOverviewIcon icon={habit.icon} size={16} />
                        )}
                        {onTitleChange ? (
                          <TextInput
                            value={titleDraft}
                            onChangeText={setTitleDraft}
                            onBlur={commitTitle}
                            onSubmitEditing={commitTitle}
                            returnKeyType="done"
                            blurOnSubmit
                            placeholder="Habit name"
                            placeholderTextColor={colors.muted}
                            accessibilityLabel="Habit name"
                            style={[styles.title, styles.titleInput]}
                          />
                        ) : (
                          <Text style={styles.title} numberOfLines={2}>
                            {habit.title}
                          </Text>
                        )}
                      </>
                    ) : null}
                    <Text
                      style={[
                        styles.counts,
                        !isPad ? styles.countsPhone : null,
                      ]}
                    >
                      {counts.completed} completed · {counts.canceled} missed
                    </Text>
                    <HabitDescriptionField
                      value={habit.description}
                      collapseToOneLine={!isPad}
                      centered={!isPad}
                      onChange={onDescriptionChange}
                    />
                  </>
                ) : (
                  <Text style={styles.title}>All</Text>
                )}
              </View>
              {isPad ? (
                <YearNavigator
                  year={year}
                  onChange={setYear}
                  maxYear={currentYear}
                />
              ) : null}
            </View>
          ) : null}
          <View
            style={[styles.controls, !isPad ? styles.controlsPhone : null]}
          >
            <View
              style={[
                styles.controlsLeft,
                !isPad ? styles.controlsLeftPhone : null,
              ]}
            >
              {habit ? (
                <>
                  <Chip
                    icon={
                      <PrimerOcticon
                        name="sync"
                        size={12}
                        color={colors.muted}
                      />
                    }
                    label={getHabitCadenceLabel(cadence ?? "daily")}
                    onPress={
                      onCadenceChange
                        ? () => setControlPicker("cadence")
                        : undefined
                    }
                  />
                  <Chip
                    icon={<TaskDueDateIcon active size={12} />}
                    label={
                      formatTaskDueMetaLabel(nextDueYmd) ?? nextDueYmd
                    }
                    onPress={
                      onNextDueChange
                        ? () => setControlPicker("nextDue")
                        : undefined
                    }
                  />
                  <Chip
                    icon={
                      selectedProject ? (
                        <ProjectOcticon
                          icon={selectedProject.icon}
                          type={selectedProject.type}
                          size={14}
                          color={colors.muted}
                        />
                      ) : (
                        <ProjectOcticon
                          icon={null}
                          size={14}
                          color={colors.muted}
                        />
                      )
                    }
                    label={selectedProject?.name ?? "Health"}
                    onPress={
                      onProjectChange && projects.length > 0
                        ? () => setControlPicker("project")
                        : undefined
                    }
                  />
                </>
              ) : null}
              {sortChip}
            </View>
          </View>
        </View>

        <View style={styles.months} onLayout={onMonthsLayout}>
          {timeline.map((entry, monthIndex) => {
            const { grid, sectionId, cells } = entry;
            const nearFocus = Math.abs(monthIndex - focusMonthIndex) <= 2;
            const renderCells = monthsReady || nearFocus;
            const columnsForEstimate = columns;
            const rows = Math.ceil(cells.length / columnsForEstimate);
            const placeholderHeight =
              cellSize > 0
                ? 34 +
                  rows * cellSize +
                  Math.max(0, rows - 1) * gap
                : 120;
            return (
              <View
                key={sectionId}
                style={styles.month}
                collapsable={false}
                onLayout={(event) => {
                  sectionYRef.current.set(
                    sectionId,
                    headerHeightRef.current + event.nativeEvent.layout.y,
                  );
                }}
              >
                <View style={styles.monthHeader}>
                  <Text style={styles.monthLabel}>{grid.label}</Text>
                  {grid.secondaryLabel ? (
                    <Text style={styles.monthSecondary}>
                      {grid.secondaryLabel}
                    </Text>
                  ) : null}
                </View>
                {renderCells && cellSize > 0 ? (
                  <View style={[styles.grid, { gap }]}>
                    {cells.map((cell) => {
                      const displayState = optimistic[cell.ymd] ?? cell.state;
                      const displayCell =
                        optimistic[cell.ymd] && displayState !== cell.state
                          ? { ...cell, state: displayState }
                          : cell;
                      const isChoosing =
                        choosing?.ymd === cell.ymd &&
                        choiceOpen &&
                        !optimistic[cell.ymd];
                      const isFocus = cell.ymd === focusYmd;
                      const taskId = taskIdByYmd.get(cell.ymd);
                      const canChoose =
                        Boolean(habit && onRecordDay) &&
                        cell.ymd <= todayYmd &&
                        displayCell.state === "empty";
                      const canDelete =
                        Boolean(habit && onDeleteDay && taskId) &&
                        cell.ymd <= todayYmd &&
                        (displayCell.state === "completed" ||
                          displayCell.state === "canceled");
                      const bg = cellBackground(displayCell);
                      const isFilled =
                        displayCell.state === "completed" ||
                        displayCell.state === "canceled" ||
                        displayCell.state === "heat";
                      const chrome = cellChrome(
                        displayCell,
                        isFocus,
                        isChoosing,
                        isFilled,
                        bg,
                      );
                      const canShowHeat =
                        displayCell.state === "heat" &&
                        Boolean(displayCell.heat?.entries.length);
                      const dashColor =
                        displayCell.state === "scheduled"
                          ? "rgba(255,255,255,0.42)"
                          : "rgba(255,255,255,0.22)";

                      const square = (
                        <Pressable
                          disabled={
                            !canChoose &&
                            !canDelete &&
                            !isChoosing &&
                            !canShowHeat
                          }
                          onPress={(event) => {
                            if (isChoosing) {
                              dismissChoice();
                              return;
                            }
                            if (choosing && choosing.ymd !== cell.ymd) {
                              dismissChoice();
                            }
                            if (
                              canShowHeat &&
                              displayCell.heat &&
                              displayCell.heat.entries.length > 0
                            ) {
                              openHeatTip(
                                cell.ymd,
                                displayCell.heat,
                                event,
                                cellSize,
                              );
                              return;
                            }
                            if (canChoose) {
                              openChoice(cell.ymd, event, cellSize);
                              return;
                            }
                            if (canDelete && taskId && onDeleteDay) {
                              Alert.alert(
                                "Remove habit day?",
                                `Clear the result for ${cell.ymd}.`,
                                [
                                  { text: "Cancel", style: "cancel" },
                                  {
                                    text: "Delete",
                                    style: "destructive",
                                    onPress: () => {
                                      void onDeleteDay({
                                        taskId,
                                        dueYmd: cell.ymd,
                                      });
                                    },
                                  },
                                ],
                              );
                            }
                          }}
                          style={[
                            styles.cell,
                            {
                              width: cellSize,
                              height: cellSize,
                              backgroundColor: chrome.backgroundColor,
                              borderColor: chrome.borderColor,
                              borderWidth: chrome.borderWidth,
                            },
                          ]}
                        >
                          {chrome.dashed ? (
                            <DashedSquareBorder
                              size={cellSize}
                              color={dashColor}
                            />
                          ) : null}
                          {!isChoosing ? (
                            <>
                              <Text
                                style={[
                                  styles.cellWeekday,
                                  isFilled ? styles.cellMarkFilled : null,
                                ]}
                              >
                                {weekdayShortFromYmd(cell.ymd)}
                              </Text>
                              <Text
                                style={[
                                  styles.cellDay,
                                  isFilled ? styles.cellMarkFilled : null,
                                ]}
                              >
                                {cell.day}
                              </Text>
                            </>
                          ) : null}
                        </Pressable>
                      );

                      return (
                        <View
                          key={cell.id}
                          ref={isFocus ? todayHostRef : undefined}
                          collapsable={false}
                        >
                          {square}
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View style={{ height: placeholderHeight }} />
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
        </View>
      </DetailContentContainer>
      </View>
      <Modal
        visible={heatTip != null}
        transparent
        animationType="none"
        onRequestClose={dismissHeatTip}
      >
        <View style={styles.heatTipModalRoot} pointerEvents="box-none">
          <Pressable
            style={styles.heatTipBackdrop}
            onPress={dismissHeatTip}
            accessibilityLabel="Dismiss habit day details"
          />
          {heatTip ? (
            (() => {
              const windowWidth = Dimensions.get("window").width;
              const windowHeight = Dimensions.get("window").height;
              const cardWidth = Math.min(248, Math.max(160, windowWidth - 24));
              const maxLeft = Math.max(12, windowWidth - cardWidth - 12);
              const preferredLeft =
                heatTip.pageX + heatTip.width / 2 - cardWidth / 2;
              const left = Math.max(12, Math.min(preferredLeft, maxLeft));
              // Always above the square: pin tip bottom to just over the cell top.
              const bottom = Math.max(8, windowHeight - heatTip.pageY + 10);
              const caretLeft = Math.min(
                cardWidth - 18,
                Math.max(
                  14,
                  heatTip.pageX + heatTip.width / 2 - left - 6,
                ),
              );
              return (
                <View
                  pointerEvents="none"
                  style={[
                    styles.heatTipAnchor,
                    { left, bottom, width: cardWidth },
                  ]}
                >
                  <View style={styles.heatTipCardWrap}>
                    <HabitHeatTooltipCard
                      ymd={heatTip.ymd}
                      heat={heatTip.heat}
                    />
                  </View>
                  <View style={[styles.heatTipCaret, { left: caretLeft }]} />
                </View>
              );
            })()
          ) : null}
        </View>
      </Modal>
      <Modal
        visible={choosing != null}
        transparent
        animationType="none"
        onRequestClose={dismissChoice}
      >
        <View style={styles.heatTipModalRoot} pointerEvents="box-none">
          <Pressable
            style={styles.heatTipBackdrop}
            onPress={dismissChoice}
            accessibilityLabel="Dismiss habit day choice"
          />
          {choosing ? (
            <View
              pointerEvents="box-none"
              style={[
                styles.choiceOverlayAnchor,
                {
                  left: choosing.pageX,
                  top: choosing.pageY,
                  width: choosing.size,
                  height: choosing.size,
                },
              ]}
            >
              <HabitDayChoice
                size={choosing.size}
                ymd={choosing.ymd}
                open={choiceOpen}
                onClosed={clearChoice}
                onPick={(status) => {
                  void handlePick(choosing.ymd, status);
                }}
              />
            </View>
          ) : null}
        </View>
      </Modal>
      <PropertyOptionSheet
        visible={controlPicker === "cadence"}
        title="Due cadence"
        searchPlaceholder="Change due cadence…"
        options={cadenceSheetOptions}
        selected={cadence ?? "daily"}
        onSelect={(value) => {
          onCadenceChange?.(value);
          closeControlPicker();
        }}
        onClose={closeControlPicker}
      />
      <DueDatePropertySheet
        visible={controlPicker === "nextDue"}
        title="Next due"
        selected={nextDueSelectedIso}
        allowClear={false}
        onSelect={(value) => {
          if (!value || !onNextDueChange) {
            closeControlPicker();
            return;
          }
          const parsed = new Date(value);
          if (Number.isNaN(parsed.getTime())) {
            closeControlPicker();
            return;
          }
          void onNextDueChange(formatLocalYmd(parsed));
          closeControlPicker();
        }}
        onClose={closeControlPicker}
      />
      {habit && onIconChange ? (
        <EntityIconPickerSheet
          visible={iconPickerOpen}
          value={habit.icon}
          title="Choose habit icon"
          defaultLabel="Default habit icon"
          onClose={() => setIconPickerOpen(false)}
          onSelect={(icon) => {
            void onIconChange(icon);
          }}
        />
      ) : null}
      <PropertyOptionSheet
        visible={controlPicker === "project"}
        title="Project"
        searchPlaceholder="Change project…"
        options={projectSheetOptions}
        selected={selectedProject?.id ?? projects[0]?.id ?? ""}
        onSelect={(value) => {
          onProjectChange?.(value);
          closeControlPicker();
        }}
        onClose={closeControlPicker}
      />
      <PropertyOptionSheet
        visible={controlPicker === "sort"}
        title="Sort"
        searchPlaceholder="Change sort…"
        options={sortSheetOptions}
        selected={sort}
        onSelect={(value) => {
          setSort(value);
          closeControlPicker();
        }}
        onClose={closeControlPicker}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    position: "relative",
  },
  body: {
    flex: 1,
    minHeight: 0,
    position: "relative",
  },
  column: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    position: "relative",
  },
  root: {
    flex: 1,
  },
  content: {
    paddingBottom: FLOATING_TAB_BAR_CLEARANCE,
  },
  headerFade: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 4,
    height: HEADER_FADE_HEIGHT,
  },
  header: {
    flexDirection: "column",
    paddingHorizontal: spacing.screenX,
    paddingTop: 24,
    paddingBottom: 12,
    paddingLeft: spacing.screenX + 28,
    backgroundColor: colors.background,
    zIndex: 2,
  },
  headerPhone: {
    paddingTop: 12,
    paddingLeft: spacing.screenX,
    paddingRight: spacing.screenX,
    alignItems: "center",
    alignSelf: "stretch",
    width: "100%",
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },
  headerTopPhone: {
    alignSelf: "stretch",
    width: "100%",
    justifyContent: "center",
  },
  heading: {
    flex: 1,
    minWidth: 0,
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 8,
  },
  headingPhone: {
    flex: 0,
    alignSelf: "stretch",
    width: "100%",
    alignItems: "center",
    gap: 6,
  },
  title: {
    color: colors.foreground,
    fontSize: 22,
    fontWeight: "600",
    letterSpacing: -0.44,
    lineHeight: 27.5,
  },
  titleInput: {
    width: "100%",
    padding: 0,
    margin: 0,
  },
  titlePhone: {
    textAlign: "center",
  },
  counts: {
    color: "rgba(255, 255, 255, 0.55)",
    fontSize: 14,
  },
  countsPhone: {
    alignSelf: "stretch",
    width: "100%",
    textAlign: "center",
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 24,
  },
  controlsPhone: {
    width: "100%",
    justifyContent: "center",
    marginTop: 16,
  },
  controlsLeft: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  controlsLeftPhone: {
    flex: 0,
    justifyContent: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: 180,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  chipPressed: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  chipDisabled: {
    opacity: 0.7,
  },
  chipIcon: {
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  chipLabel: {
    flexShrink: 1,
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 16,
  },
  months: {
    paddingHorizontal: spacing.screenX,
    paddingLeft: spacing.screenX + 28,
    gap: 28,
    paddingTop: 12,
  },
  month: {
    gap: 10,
  },
  monthHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  monthLabel: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "600",
  },
  monthSecondary: {
    color: colors.muted,
    fontSize: 13,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: "100%",
  },
  cell: {
    borderRadius: 4,
    overflow: "hidden",
  },
  cellWeekday: {
    position: "absolute",
    top: 3,
    left: 4,
    fontSize: 9,
    fontWeight: "600",
    color: "rgba(255,255,255,0.32)",
  },
  cellDay: {
    position: "absolute",
    top: 3,
    right: 4,
    fontSize: 9,
    fontWeight: "600",
    color: "rgba(255,255,255,0.32)",
  },
  cellMarkFilled: {
    color: "rgba(0,0,0,0.42)",
  },
  heatTipModalRoot: {
    flex: 1,
  },
  heatTipBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  choiceOverlayAnchor: {
    position: "absolute",
    overflow: "hidden",
    borderRadius: 4,
  },
  heatTipAnchor: {
    position: "absolute",
  },
  heatTipCardWrap: {
    borderRadius: 10,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  heatTipCaret: {
    position: "absolute",
    bottom: -6,
    width: 12,
    height: 12,
    backgroundColor: "#1c1c1e",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.16)",
    transform: [{ rotate: "45deg" }],
  },
  heatTipCard: {
    maxWidth: 280,
    minWidth: 160,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "#1c1c1e",
    gap: 8,
  },
  heatTipDate: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 11,
    fontWeight: "600",
  },
  heatTipList: {
    gap: 6,
  },
  heatTipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  heatTipSwatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  heatTipSwatchCompleted: {
    backgroundColor: HABIT_GREEN,
  },
  heatTipSwatchCanceled: {
    backgroundColor: HABIT_RED,
  },
  heatTipTitle: {
    flex: 1,
    minWidth: 0,
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
  },
});

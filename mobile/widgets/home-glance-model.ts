/** Pure helpers for home glance widgets — used by the app, not imported into widget bodies. */

import {
  migrateLegacyTaskStatus,
  TASK_STATUS_COLORS,
} from "../lib/task-status";
import {
  isTaskPriorityNone,
  isTaskPriorityUrgent,
} from "../lib/task-priority";

export type HomeGlanceTab = "inbox" | "tasks" | "email" | "finance";

/** Resolve a timeline/prop tab id (incl. legacy `github` → finance). */
export function resolveHomeGlanceTab(value: unknown): HomeGlanceTab | null {
  if (
    value === "inbox" ||
    value === "tasks" ||
    value === "email" ||
    value === "finance"
  ) {
    return value;
  }
  if (value === "github") return "finance";
  return null;
}

/** Clamp a finance month index into `[0, monthCount)`. */
export function clampHomeGlanceFinanceIndex(
  index: number,
  monthCount: number,
): number {
  if (monthCount <= 0 || !Number.isFinite(index)) return 0;
  return Math.min(Math.max(0, Math.floor(index)), monthCount - 1);
}


export type HomeGlanceFinanceMonthSnapshot = {
  monthKey: string;
  monthLabel: string;
  incomeTotalLabel: string;
  /** Net for the month (income − expenses), signed. */
  balanceTotalLabel: string;
  /** Hex color for the balance amount (green / red). */
  balanceColor: string;
  expenseTotalLabel: string;
  /** Comma-separated euro amounts (may be densified for smooth lines). */
  incomeSeries: string;
  expenseSeries: string;
  dayCount: number;
};

export type HomeGlanceFinanceInput = {
  /** Oldest → newest month snapshots (widget can step through without refetch). */
  months: HomeGlanceFinanceMonthSnapshot[];
  /** Index into `months` shown when the snapshot is pushed. */
  selectedIndex: number;
  viewMoreUrl: string;
};

export type DayPeriod = "morning" | "afternoon" | "evening" | "night";

/** Max inbox rows shown in the large widget (WidgetKit has no scrolling). */
export const HOME_GLANCE_INBOX_LIMIT = 5;

export type HomeGlanceInboxItem = {
  id: string;
  title: string;
  meta: string;
  /** SF Symbol matching the iOS inbox list status icon. */
  icon: string;
  iconColor: string;
  /** SF Symbol approximating the in-app priority glyph (empty = hide). */
  priorityIcon: string;
  priorityIconColor: string;
};

export type HomeGlanceHeaderProps = {
  greeting: string;
  dateLabel: string;
  periodIcon: string;
  weatherIcon: string;
  temperatureLabel: string;
  /** App Group file:// URI for the medium widget background image. */
  backgroundImageUri: string;
  /** Opens today's journal when the medium widget is tapped. */
  journalUrl: string;
  /** When false, the medium widget hides the Whoop ring cluster. */
  whoopVisible: boolean;
  whoopSleepProgress: number;
  whoopSleepLabel: string;
  whoopRecoveryProgress: number;
  whoopRecoveryLabel: string;
  whoopStrainProgress: number;
  whoopStrainLabel: string;
};

export type HomeGlanceSectionsProps = {
  selectedTab: HomeGlanceTab;
  /** App Group file:// URI for the large widget background image. */
  backgroundImageUri: string;
  /** e.g. "5/13" — shown / total inbox items. */
  inboxCountLabel: string;
  /** Empty = hide; else hex for the Inbox tab attention dot. */
  inboxIndicatorColor: string;
  inboxListUrl: string;
  inboxUrl0: string;
  inboxTitle0: string;
  inboxMeta0: string;
  inboxIcon0: string;
  inboxIconColor0: string;
  inboxPriorityIcon0: string;
  inboxPriorityIconColor0: string;
  inboxUrl1: string;
  inboxTitle1: string;
  inboxMeta1: string;
  inboxIcon1: string;
  inboxIconColor1: string;
  inboxPriorityIcon1: string;
  inboxPriorityIconColor1: string;
  inboxUrl2: string;
  inboxTitle2: string;
  inboxMeta2: string;
  inboxIcon2: string;
  inboxIconColor2: string;
  inboxPriorityIcon2: string;
  inboxPriorityIconColor2: string;
  inboxUrl3: string;
  inboxTitle3: string;
  inboxMeta3: string;
  inboxIcon3: string;
  inboxIconColor3: string;
  inboxPriorityIcon3: string;
  inboxPriorityIconColor3: string;
  inboxUrl4: string;
  inboxTitle4: string;
  inboxMeta4: string;
  inboxIcon4: string;
  inboxIconColor4: string;
  inboxPriorityIcon4: string;
  inboxPriorityIconColor4: string;
  /** e.g. "5/13" — shown / total tasks due today. */
  todayCountLabel: string;
  todayListUrl: string;
  todayUrl0: string;
  todayTitle0: string;
  todayMeta0: string;
  todayIcon0: string;
  todayIconColor0: string;
  todayPriorityIcon0: string;
  todayPriorityIconColor0: string;
  todayUrl1: string;
  todayTitle1: string;
  todayMeta1: string;
  todayIcon1: string;
  todayIconColor1: string;
  todayPriorityIcon1: string;
  todayPriorityIconColor1: string;
  todayUrl2: string;
  todayTitle2: string;
  todayMeta2: string;
  todayIcon2: string;
  todayIconColor2: string;
  todayPriorityIcon2: string;
  todayPriorityIconColor2: string;
  todayUrl3: string;
  todayTitle3: string;
  todayMeta3: string;
  todayIcon3: string;
  todayIconColor3: string;
  todayPriorityIcon3: string;
  todayPriorityIconColor3: string;
  todayUrl4: string;
  todayTitle4: string;
  todayMeta4: string;
  todayIcon4: string;
  todayIconColor4: string;
  todayPriorityIcon4: string;
  todayPriorityIconColor4: string;
  financeMonthKey: string;
  financeMonthLabel: string;
  /** "1" when an older month is available. */
  financeCanGoPrev: string;
  /** "1" when a newer month is available. */
  financeCanGoNext: string;
  financeIncomeTotalLabel: string;
  financeBalanceTotalLabel: string;
  financeBalanceColor: string;
  financeExpenseTotalLabel: string;
  financeIncomeSeries: string;
  financeExpenseSeries: string;
  financeDayCount: number;
  financeViewMoreUrl: string;
  /** Selected index into `financeMonthsPack` (0 = oldest). */
  financeIndex: number;
  financeMonthCount: number;
  /**
   * Month rows joined with `;;`, fields with `|` (no newlines/tabs — those
   * break the expo-widgets layout template literal). Used to step months
   * in the widget without another network round-trip.
   */
  financeMonthsPack: string;
};

export function dayPeriodFromHour(hour: number): DayPeriod {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

export function greetingForPeriod(period: DayPeriod): string {
  switch (period) {
    case "morning":
      return "Good morning";
    case "afternoon":
      return "Good afternoon";
    case "evening":
      return "Good evening";
    case "night":
      return "Good night";
  }
}

/** SF Symbol for time-of-day hero icon. */
export function periodIconForPeriod(period: DayPeriod): string {
  switch (period) {
    case "morning":
      return "sunrise.fill";
    case "afternoon":
      return "sun.max.fill";
    case "evening":
      return "sunset.fill";
    case "night":
      return "moon.stars.fill";
  }
}

export function formatHomeGlanceDate(date: Date): string {
  const weekday = date.toLocaleDateString("en-GB", { weekday: "long" });
  const day = date.getDate();
  const month = date.toLocaleDateString("en-GB", { month: "long" });
  return `${weekday} ${day} ${month}`;
}

export type HomeGlanceWeatherInput = {
  weatherIcon: string;
  temperatureLabel: string;
};

const DEFAULT_WEATHER: HomeGlanceWeatherInput = {
  weatherIcon: "cloud.sun.fill",
  temperatureLabel: "—",
};

/** Flat Whoop ring props for the medium header widget. */
export type HomeGlanceWhoopInput = {
  whoopVisible: boolean;
  whoopSleepProgress: number;
  whoopSleepLabel: string;
  whoopRecoveryProgress: number;
  whoopRecoveryLabel: string;
  whoopStrainProgress: number;
  whoopStrainLabel: string;
};

export const WHOOP_METRIC_MAX = {
  sleep: 100,
  recovery: 100,
  strain: 21,
} as const;

export const WHOOP_METRIC_COLORS = {
  sleep: "#9D5AEF",
  recovery: "#5EC269",
  strain: "#4F81EE",
} as const;

const DEFAULT_WHOOP: HomeGlanceWhoopInput = {
  whoopVisible: false,
  whoopSleepProgress: 0,
  whoopSleepLabel: "—",
  whoopRecoveryProgress: 0,
  whoopRecoveryLabel: "—",
  whoopStrainProgress: 0,
  whoopStrainLabel: "—",
};

export function whoopProgress(
  value: number | null | undefined,
  max: number,
): number {
  if (value == null || Number.isNaN(value) || value < 0) return 0;
  return Math.min(1, Math.max(0, value / max));
}

export function formatWhoopMetricLabel(
  value: number | null | undefined,
  max: number,
  digits = 0,
): string {
  if (value == null || Number.isNaN(value) || value < 0 || value > max) {
    return "—";
  }
  if (digits > 0) return value.toFixed(digits);
  return Number.isInteger(value) ? String(value) : String(Math.round(value));
}

/** Map a Whoop day snapshot into serializable medium-widget ring props. */
export function mapWhoopSnapshotToHomeGlance(
  snapshot: {
    sleepPerformance?: number | null;
    recoveryScore?: number | null;
    strainScore?: number | null;
  } | null,
  authenticated: boolean,
): HomeGlanceWhoopInput {
  if (!authenticated) return { ...DEFAULT_WHOOP };
  return {
    whoopVisible: true,
    whoopSleepProgress: whoopProgress(
      snapshot?.sleepPerformance,
      WHOOP_METRIC_MAX.sleep,
    ),
    whoopSleepLabel: formatWhoopMetricLabel(
      snapshot?.sleepPerformance,
      WHOOP_METRIC_MAX.sleep,
    ),
    whoopRecoveryProgress: whoopProgress(
      snapshot?.recoveryScore,
      WHOOP_METRIC_MAX.recovery,
    ),
    whoopRecoveryLabel: formatWhoopMetricLabel(
      snapshot?.recoveryScore,
      WHOOP_METRIC_MAX.recovery,
    ),
    whoopStrainProgress: whoopProgress(
      snapshot?.strainScore,
      WHOOP_METRIC_MAX.strain,
    ),
    whoopStrainLabel: formatWhoopMetricLabel(
      snapshot?.strainScore,
      WHOOP_METRIC_MAX.strain,
      1,
    ),
  };
}

/** WMO weather interpretation codes → SF Symbol (Open-Meteo). */
export function weatherIconForCode(code: number, isDay: boolean): string {
  if (code === 0) return isDay ? "sun.max.fill" : "moon.stars.fill";
  if (code === 1 || code === 2) {
    return isDay ? "cloud.sun.fill" : "cloud.moon.fill";
  }
  if (code === 3) return "cloud.fill";
  if (code === 45 || code === 48) return "cloud.fog.fill";
  if (code >= 51 && code <= 67) return "cloud.rain.fill";
  if (code >= 71 && code <= 77) return "cloud.snow.fill";
  if (code >= 80 && code <= 82) return "cloud.heavyrain.fill";
  if (code >= 85 && code <= 86) return "cloud.snow.fill";
  if (code >= 95 && code <= 99) return "cloud.bolt.rain.fill";
  return "cloud.sun.fill";
}

export function formatTemperatureCelsius(celsius: number): string {
  return `${Math.round(celsius)}°`;
}

/** SF Symbol approximating the in-app task status glyph for widgets. */
export function inboxStatusIconForStatus(
  status: string | null | undefined,
): string {
  switch (migrateLegacyTaskStatus(status)) {
    case "triage":
      return "arrow.left.arrow.right.circle.fill";
    case "backlog":
      return "circle.dotted";
    case "ready_to_start":
      return "circle";
    case "in_progress":
      return "circle.lefthalf.filled";
    case "on_hold":
      return "circle.bottomhalf.filled";
    case "in_review":
      return "circle.inset.filled";
    case "completed":
      return "checkmark.circle.fill";
    case "canceled":
      return "xmark.circle";
    case "duplicated":
      return "rectangle.on.rectangle";
  }
}

/** Status tint tuned for dark glyphs on the light forest photo. */
const INBOX_STATUS_ICON_COLORS: Record<
  ReturnType<typeof migrateLegacyTaskStatus>,
  string
> = {
  triage: "#c45f2f",
  backlog: "#4a4a4e",
  ready_to_start: "#1c1c1e",
  in_progress: "#a67c00",
  on_hold: "#b83f3b",
  in_review: "#2f6e2e",
  completed: "#3f4a9e",
  canceled: "#4a4a4e",
  duplicated: "#4a5560",
};

export function inboxStatusColorForStatus(
  status: string | null | undefined,
): string {
  return INBOX_STATUS_ICON_COLORS[migrateLegacyTaskStatus(status)];
}

/** SF Symbol approximating the in-app priority glyph for widgets. */
export function inboxPriorityIconForPriority(
  priority?: number | null,
): string {
  // Match the old meta text: omit when there is no priority.
  if (isTaskPriorityNone(priority)) return "";
  if (isTaskPriorityUrgent(priority)) return "exclamationmark.square.fill";
  // High / medium / low — bar-style signal metaphor.
  if (priority === 4) return "chart.bar";
  if (priority === 3) return "chart.bar.fill";
  return "chart.bar.fill";
}

export function inboxPriorityIconColorForPriority(
  priority?: number | null,
): string {
  if (isTaskPriorityUrgent(priority)) return INBOX_STATUS_ICON_COLORS.triage;
  if (isTaskPriorityNone(priority)) return "#1C1C1E66";
  if (priority === 4) return "#1C1C1E66";
  if (priority === 3) return "#1C1C1E99";
  return "#1C1C1ECC";
}



/** Deep link into a specific inbox task detail screen. */
export function homeGlanceInboxItemUrl(taskId: string): string {
  const id = taskId.trim();
  if (!id) return "";
  return "backsteros-v2://inbox/" + encodeURIComponent(id);
}

/** Deep link to the inbox list (View more). */
export function homeGlanceInboxListUrl(): string {
  return "backsteros-v2://inbox";
}

/** Deep link into a task detail screen (Today / Tasks). */
export function homeGlanceTaskItemUrl(taskId: string): string {
  const id = taskId.trim();
  if (!id) return "";
  return "backsteros-v2://tasks/" + encodeURIComponent(id);
}

/** Deep link to the tasks list (View more on Today). */
export function homeGlanceTasksListUrl(): string {
  return "backsteros-v2://tasks";
}

/** Deep link into today's (or a given day's) journal entry. */
export function homeGlanceJournalDayUrl(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return "backsteros-v2://journal/" + year + "-" + month + "-" + day;
}

export function buildHomeGlanceHeaderProps(
  now: Date = new Date(),
  backgroundImageUri = "",
  weather: HomeGlanceWeatherInput = DEFAULT_WEATHER,
  whoop: HomeGlanceWhoopInput = DEFAULT_WHOOP,
): HomeGlanceHeaderProps {
  const period = dayPeriodFromHour(now.getHours());
  return {
    greeting: greetingForPeriod(period),
    dateLabel: formatHomeGlanceDate(now),
    periodIcon: periodIconForPeriod(period),
    weatherIcon: weather.weatherIcon || DEFAULT_WEATHER.weatherIcon,
    temperatureLabel:
      weather.temperatureLabel || DEFAULT_WEATHER.temperatureLabel,
    backgroundImageUri,
    journalUrl: homeGlanceJournalDayUrl(now),
    whoopVisible: whoop.whoopVisible,
    whoopSleepProgress: whoop.whoopSleepProgress,
    whoopSleepLabel: whoop.whoopSleepLabel,
    whoopRecoveryProgress: whoop.whoopRecoveryProgress,
    whoopRecoveryLabel: whoop.whoopRecoveryLabel,
    whoopStrainProgress: whoop.whoopStrainProgress,
    whoopStrainLabel: whoop.whoopStrainLabel,
  };
}

function inboxSlot(
  items: HomeGlanceInboxItem[],
  index: number,
): {
  id: string;
  title: string;
  meta: string;
  icon: string;
  iconColor: string;
  priorityIcon: string;
  priorityIconColor: string;
} {
  const item = items[index];
  return {
    id: item?.id ?? "",
    title: item?.title ?? "",
    meta: item?.meta ?? "",
    icon: item?.icon ?? "circle",
    iconColor: item?.iconColor ?? "#4a4a4e",
    priorityIcon: item?.priorityIcon ?? "",
    priorityIconColor: item?.priorityIconColor ?? "#1C1C1E66",
  };
}

export function formatHomeGlanceInboxCountLabel(
  shown: number,
  total: number,
): string {
  const safeShown = Math.max(0, Math.floor(shown));
  const safeTotal = Math.max(safeShown, Math.floor(total));
  if (safeTotal <= 0) return "";
  return `${safeShown}/${safeTotal}`;
}


/** Sidebar/widget Inbox attention dot — matches desktop indicator semantics. */
export type InboxSidebarIndicatorTone = "none" | "muted" | "green" | "orange";

export const INBOX_SIDEBAR_INDICATOR_COLORS = {
  orange: "#ee7a47",
  green: "#34C759",
  muted: "#636366",
} as const;

/**
 * Pick the Inbox tab/sidebar dot color.
 * Priority: orange (triage/agents/overdue) → green (updated) → muted (other items) → none.
 */
export function resolveInboxSidebarIndicatorTone(input: {
  totalCount: number;
  attentionCount: number;
  updatedCount: number;
}): InboxSidebarIndicatorTone {
  const total = Math.max(0, Math.floor(input.totalCount));
  if (total <= 0) return "none";
  if (input.attentionCount > 0) return "orange";
  if (input.updatedCount > 0) return "green";
  return "muted";
}

export function inboxSidebarIndicatorColor(
  tone: InboxSidebarIndicatorTone,
): string {
  if (tone === "none") return "";
  return INBOX_SIDEBAR_INDICATOR_COLORS[tone];
}


export function homeGlanceFinanceUrl(): string {
  return "backsteros-v2://finance";
}

/** Field / row separators for the offline month pack.
 * Avoid `\t`/`\n` — those must also be split inside the widget layout string,
 * and expo-widgets embeds that layout in a template literal (escapes break). */
export const FINANCE_PACK_FIELD_SEP = "|";
export const FINANCE_PACK_ROW_SEP = ";;";

function emptyFinanceMonth(monthKey = ""): HomeGlanceFinanceMonthSnapshot {
  return {
    monthKey,
    monthLabel: monthKey,
    incomeTotalLabel: "€0,00",
    balanceTotalLabel: "€0,00",
    balanceColor: "#FFFFFF",
    expenseTotalLabel: "€0,00",
    incomeSeries: "",
    expenseSeries: "",
    dayCount: 0,
  };
}

export function encodeHomeGlanceFinanceMonthsPack(
  months: readonly HomeGlanceFinanceMonthSnapshot[],
): string {
  return months
    .map((month) =>
      [
        month.monthKey,
        month.monthLabel,
        month.incomeTotalLabel,
        month.balanceTotalLabel,
        month.balanceColor,
        month.expenseTotalLabel,
        String(month.dayCount),
        month.incomeSeries,
        month.expenseSeries,
      ].join(FINANCE_PACK_FIELD_SEP),
    )
    .join(FINANCE_PACK_ROW_SEP);
}

export function decodeHomeGlanceFinanceMonthRow(
  row: string,
): HomeGlanceFinanceMonthSnapshot {
  const parts = row.split(FINANCE_PACK_FIELD_SEP);
  return {
    monthKey: parts[0] ?? "",
    monthLabel: parts[1] ?? "",
    incomeTotalLabel: parts[2] ?? "€0,00",
    balanceTotalLabel: parts[3] ?? "€0,00",
    balanceColor: parts[4] ?? "#FFFFFF",
    expenseTotalLabel: parts[5] ?? "€0,00",
    dayCount: Number(parts[6]) || 0,
    incomeSeries: parts[7] ?? "",
    expenseSeries: parts[8] ?? "",
  };
}

export const EMPTY_HOME_GLANCE_FINANCE: HomeGlanceFinanceInput = {
  months: [],
  selectedIndex: 0,
  viewMoreUrl: homeGlanceFinanceUrl(),
};

function financePropsFromInput(
  finance: HomeGlanceFinanceInput = EMPTY_HOME_GLANCE_FINANCE,
): Pick<
  HomeGlanceSectionsProps,
  | "financeMonthKey"
  | "financeMonthLabel"
  | "financeCanGoPrev"
  | "financeCanGoNext"
  | "financeIncomeTotalLabel"
  | "financeBalanceTotalLabel"
  | "financeBalanceColor"
  | "financeExpenseTotalLabel"
  | "financeIncomeSeries"
  | "financeExpenseSeries"
  | "financeDayCount"
  | "financeViewMoreUrl"
  | "financeIndex"
  | "financeMonthCount"
  | "financeMonthsPack"
> {
  const months = finance.months ?? [];
  const selectedIndex = Math.min(
    Math.max(0, finance.selectedIndex ?? 0),
    Math.max(0, months.length - 1),
  );
  const selected = months[selectedIndex] ?? emptyFinanceMonth();
  const pack = encodeHomeGlanceFinanceMonthsPack(months);
  return {
    financeMonthKey: selected.monthKey,
    financeMonthLabel: selected.monthLabel,
    financeCanGoPrev: selectedIndex > 0 ? "1" : "0",
    financeCanGoNext: selectedIndex < months.length - 1 ? "1" : "0",
    financeIncomeTotalLabel: selected.incomeTotalLabel,
    financeBalanceTotalLabel: selected.balanceTotalLabel,
    financeBalanceColor: selected.balanceColor,
    financeExpenseTotalLabel: selected.expenseTotalLabel,
    financeIncomeSeries: selected.incomeSeries,
    financeExpenseSeries: selected.expenseSeries,
    financeDayCount: selected.dayCount,
    financeViewMoreUrl: finance.viewMoreUrl || homeGlanceFinanceUrl(),
    financeIndex: selectedIndex,
    financeMonthCount: months.length,
    financeMonthsPack: pack,
  };
}

export function buildHomeGlanceSectionsProps(
  selectedTab: HomeGlanceTab = "inbox",
  backgroundImageUri = "",
  inboxItems: HomeGlanceInboxItem[] = [],
  inboxTotalCount = 0,
  todayItems: HomeGlanceInboxItem[] = [],
  todayTotalCount = 0,
  inboxIndicatorTone: InboxSidebarIndicatorTone = "none",
  finance: HomeGlanceFinanceInput = EMPTY_HOME_GLANCE_FINANCE,
): HomeGlanceSectionsProps {
  const cappedInbox = inboxItems.slice(0, HOME_GLANCE_INBOX_LIMIT);
  const i0 = inboxSlot(cappedInbox, 0);
  const i1 = inboxSlot(cappedInbox, 1);
  const i2 = inboxSlot(cappedInbox, 2);
  const i3 = inboxSlot(cappedInbox, 3);
  const i4 = inboxSlot(cappedInbox, 4);
  const cappedToday = todayItems.slice(0, HOME_GLANCE_INBOX_LIMIT);
  const t0 = inboxSlot(cappedToday, 0);
  const t1 = inboxSlot(cappedToday, 1);
  const t2 = inboxSlot(cappedToday, 2);
  const t3 = inboxSlot(cappedToday, 3);
  const t4 = inboxSlot(cappedToday, 4);
  return {
    selectedTab,
    backgroundImageUri,
    inboxCountLabel: formatHomeGlanceInboxCountLabel(
      cappedInbox.length,
      inboxTotalCount,
    ),
    inboxIndicatorColor: inboxSidebarIndicatorColor(inboxIndicatorTone),
    inboxListUrl: homeGlanceInboxListUrl(),
    inboxUrl0: homeGlanceInboxItemUrl(i0.id),
    inboxTitle0: i0.title,
    inboxMeta0: i0.meta,
    inboxIcon0: i0.icon,
    inboxIconColor0: i0.iconColor,
    inboxPriorityIcon0: i0.priorityIcon,
    inboxPriorityIconColor0: i0.priorityIconColor,
    inboxUrl1: homeGlanceInboxItemUrl(i1.id),
    inboxTitle1: i1.title,
    inboxMeta1: i1.meta,
    inboxIcon1: i1.icon,
    inboxIconColor1: i1.iconColor,
    inboxPriorityIcon1: i1.priorityIcon,
    inboxPriorityIconColor1: i1.priorityIconColor,
    inboxUrl2: homeGlanceInboxItemUrl(i2.id),
    inboxTitle2: i2.title,
    inboxMeta2: i2.meta,
    inboxIcon2: i2.icon,
    inboxIconColor2: i2.iconColor,
    inboxPriorityIcon2: i2.priorityIcon,
    inboxPriorityIconColor2: i2.priorityIconColor,
    inboxUrl3: homeGlanceInboxItemUrl(i3.id),
    inboxTitle3: i3.title,
    inboxMeta3: i3.meta,
    inboxIcon3: i3.icon,
    inboxIconColor3: i3.iconColor,
    inboxPriorityIcon3: i3.priorityIcon,
    inboxPriorityIconColor3: i3.priorityIconColor,
    inboxUrl4: homeGlanceInboxItemUrl(i4.id),
    inboxTitle4: i4.title,
    inboxMeta4: i4.meta,
    inboxIcon4: i4.icon,
    inboxIconColor4: i4.iconColor,
    inboxPriorityIcon4: i4.priorityIcon,
    inboxPriorityIconColor4: i4.priorityIconColor,
    todayCountLabel: formatHomeGlanceInboxCountLabel(
      cappedToday.length,
      todayTotalCount,
    ),
    todayListUrl: homeGlanceTasksListUrl(),
    todayUrl0: homeGlanceTaskItemUrl(t0.id),
    todayTitle0: t0.title,
    todayMeta0: t0.meta,
    todayIcon0: t0.icon,
    todayIconColor0: t0.iconColor,
    todayPriorityIcon0: t0.priorityIcon,
    todayPriorityIconColor0: t0.priorityIconColor,
    todayUrl1: homeGlanceTaskItemUrl(t1.id),
    todayTitle1: t1.title,
    todayMeta1: t1.meta,
    todayIcon1: t1.icon,
    todayIconColor1: t1.iconColor,
    todayPriorityIcon1: t1.priorityIcon,
    todayPriorityIconColor1: t1.priorityIconColor,
    todayUrl2: homeGlanceTaskItemUrl(t2.id),
    todayTitle2: t2.title,
    todayMeta2: t2.meta,
    todayIcon2: t2.icon,
    todayIconColor2: t2.iconColor,
    todayPriorityIcon2: t2.priorityIcon,
    todayPriorityIconColor2: t2.priorityIconColor,
    todayUrl3: homeGlanceTaskItemUrl(t3.id),
    todayTitle3: t3.title,
    todayMeta3: t3.meta,
    todayIcon3: t3.icon,
    todayIconColor3: t3.iconColor,
    todayPriorityIcon3: t3.priorityIcon,
    todayPriorityIconColor3: t3.priorityIconColor,
    todayUrl4: homeGlanceTaskItemUrl(t4.id),
    todayTitle4: t4.title,
    todayMeta4: t4.meta,
    todayIcon4: t4.icon,
    todayIconColor4: t4.iconColor,
    todayPriorityIcon4: t4.priorityIcon,
    todayPriorityIconColor4: t4.priorityIconColor,
    ...financePropsFromInput(finance),
  };
}

/** Hourly timeline so greeting/date flip without opening the app. */
export function buildHomeGlanceHeaderTimeline(
  backgroundImageUri = "",
  hoursAhead = 12,
  weather: HomeGlanceWeatherInput = DEFAULT_WEATHER,
  whoop: HomeGlanceWhoopInput = DEFAULT_WHOOP,
): Array<{ date: Date; props: HomeGlanceHeaderProps }> {
  const entries: Array<{ date: Date; props: HomeGlanceHeaderProps }> = [];
  const start = new Date();
  for (let i = 0; i <= hoursAhead; i++) {
    const date = new Date(start.getTime() + i * 60 * 60 * 1000);
    if (i > 0) {
      date.setMinutes(0, 0, 0);
    }
    entries.push({
      date,
      props: buildHomeGlanceHeaderProps(date, backgroundImageUri, weather, whoop),
    });
  }
  return entries;
}

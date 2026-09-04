import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildHomeGlanceHeaderProps,
  buildHomeGlanceSectionsProps,
  clampHomeGlanceFinanceIndex,
  encodeHomeGlanceFinanceMonthsPack,
  decodeHomeGlanceFinanceMonthRow,
  FINANCE_PACK_ROW_SEP,
  resolveHomeGlanceTab,
  resolveInboxSidebarIndicatorTone,
  inboxSidebarIndicatorColor,
  INBOX_SIDEBAR_INDICATOR_COLORS,
  formatHomeGlanceInboxCountLabel,
  homeGlanceInboxItemUrl,
  homeGlanceInboxListUrl,
  homeGlanceJournalDayUrl,
  homeGlanceTaskItemUrl,
  homeGlanceTasksListUrl,
  homeGlanceFinanceUrl,
  dayPeriodFromHour,
  formatHomeGlanceDate,
  formatTemperatureCelsius,
  greetingForPeriod,
  inboxPriorityIconColorForPriority,
  inboxPriorityIconForPriority,
  inboxStatusColorForStatus,
  inboxStatusIconForStatus,
  mapWhoopSnapshotToHomeGlance,
  periodIconForPeriod,
  weatherIconForCode,
} from "./home-glance-model.ts";

describe("home-glance-model", () => {
  it("resolves widget tab ids including legacy github", () => {
    assert.equal(resolveHomeGlanceTab("inbox"), "inbox");
    assert.equal(resolveHomeGlanceTab("finance"), "finance");
    assert.equal(resolveHomeGlanceTab("github"), "finance");
    assert.equal(resolveHomeGlanceTab("nope"), null);
  });

  it("clamps finance month index into range", () => {
    assert.equal(clampHomeGlanceFinanceIndex(5, 6), 5);
    assert.equal(clampHomeGlanceFinanceIndex(99, 6), 5);
    assert.equal(clampHomeGlanceFinanceIndex(-2, 6), 0);
    assert.equal(clampHomeGlanceFinanceIndex(1.8, 6), 1);
    assert.equal(clampHomeGlanceFinanceIndex(3, 0), 0);
  });

  it("maps hours to day periods", () => {
    assert.equal(dayPeriodFromHour(6), "morning");
    assert.equal(dayPeriodFromHour(13), "afternoon");
    assert.equal(dayPeriodFromHour(18), "evening");
    assert.equal(dayPeriodFromHour(23), "night");
    assert.equal(dayPeriodFromHour(2), "night");
  });

  it("builds greeting and SF Symbol for each period", () => {
    assert.equal(greetingForPeriod("morning"), "Good morning");
    assert.equal(periodIconForPeriod("morning"), "sunrise.fill");
    assert.equal(periodIconForPeriod("afternoon"), "sun.max.fill");
    assert.equal(periodIconForPeriod("evening"), "sunset.fill");
    assert.equal(periodIconForPeriod("night"), "moon.stars.fill");
  });

  it("formats date labels", () => {
    const label = formatHomeGlanceDate(new Date(2026, 2, 27));
    assert.match(label, /Friday/);
    assert.match(label, /27/);
    assert.match(label, /March/);
  });

  it("formats celsius as rounded degree label", () => {
    assert.equal(formatTemperatureCelsius(18.4), "18°");
    assert.equal(formatTemperatureCelsius(18.6), "19°");
    assert.equal(formatTemperatureCelsius(-2.2), "-2°");
  });

  it("maps WMO weather codes to SF Symbols", () => {
    assert.equal(weatherIconForCode(0, true), "sun.max.fill");
    assert.equal(weatherIconForCode(0, false), "moon.stars.fill");
    assert.equal(weatherIconForCode(2, true), "cloud.sun.fill");
    assert.equal(weatherIconForCode(3, true), "cloud.fill");
    assert.equal(weatherIconForCode(61, true), "cloud.rain.fill");
    assert.equal(weatherIconForCode(71, true), "cloud.snow.fill");
    assert.equal(weatherIconForCode(95, true), "cloud.bolt.rain.fill");
  });

  it("maps task status to inbox SF Symbols and colors", () => {
    assert.equal(inboxStatusIconForStatus("in_progress"), "circle.lefthalf.filled");
    assert.equal(inboxStatusIconForStatus("completed"), "checkmark.circle.fill");
    assert.equal(inboxStatusColorForStatus("triage"), "#c45f2f");
    assert.equal(inboxStatusColorForStatus("in_progress"), "#a67c00");
  });

  it("maps task priority to SF Symbols instead of labels", () => {
    assert.equal(inboxPriorityIconForPriority(1), "exclamationmark.square.fill");
    assert.equal(inboxPriorityIconForPriority(0), "");
    assert.equal(inboxPriorityIconForPriority(2), "chart.bar.fill");
    assert.equal(inboxPriorityIconColorForPriority(1), "#c45f2f");
  });

    it("builds header props with weather placeholder by default", () => {
    const props = buildHomeGlanceHeaderProps(
      new Date(2026, 2, 27, 9, 0, 0),
      "file:///bg.jpg",
    );
    assert.equal(props.greeting, "Good morning");
    assert.equal(props.periodIcon, "sunrise.fill");
    assert.equal(props.weatherIcon, "cloud.sun.fill");
    assert.equal(props.temperatureLabel, "—");
    assert.equal(props.backgroundImageUri, "file:///bg.jpg");
    assert.equal(props.journalUrl, "backsteros-v2://journal/2026-03-27");
  });

  it("builds header props with provided weather", () => {
    const props = buildHomeGlanceHeaderProps(
      new Date(2026, 2, 27, 9, 0, 0),
      "file:///bg.jpg",
      { weatherIcon: "cloud.rain.fill", temperatureLabel: "12°" },
    );
    assert.equal(props.weatherIcon, "cloud.rain.fill");
    assert.equal(props.temperatureLabel, "12°");
  });

  it("builds inbox deep link URLs", () => {
    assert.equal(
      homeGlanceInboxItemUrl("task-123"),
      "backsteros-v2://inbox/task-123",
    );
    assert.equal(
      homeGlanceInboxItemUrl("a/b"),
      "backsteros-v2://inbox/a%2Fb",
    );
    assert.equal(homeGlanceInboxItemUrl(""), "");
    assert.equal(homeGlanceInboxListUrl(), "backsteros-v2://inbox");
    assert.equal(
      homeGlanceTaskItemUrl("task-9"),
      "backsteros-v2://tasks/task-9",
    );
    assert.equal(homeGlanceTasksListUrl(), "backsteros-v2://tasks");
    assert.equal(homeGlanceFinanceUrl(), "backsteros-v2://finance");
    assert.equal(
      homeGlanceJournalDayUrl(new Date(2026, 2, 27, 9, 0, 0)),
      "backsteros-v2://journal/2026-03-27",
    );
  });

    it("formats inbox shown/total count label", () => {
    assert.equal(formatHomeGlanceInboxCountLabel(5, 13), "5/13");
    assert.equal(formatHomeGlanceInboxCountLabel(3, 3), "3/3");
    assert.equal(formatHomeGlanceInboxCountLabel(0, 0), "");
    assert.equal(formatHomeGlanceInboxCountLabel(5, 2), "5/5");
  });

  
  it("maps Whoop snapshot into ring props", () => {
    const hidden = mapWhoopSnapshotToHomeGlance(null, false);
    assert.equal(hidden.whoopVisible, false);

    const props = mapWhoopSnapshotToHomeGlance(
      { sleepPerformance: 88, recoveryScore: 64, strainScore: 12.4 },
      true,
    );
    assert.equal(props.whoopVisible, true);
    assert.equal(props.whoopSleepLabel, "88");
    assert.equal(props.whoopRecoveryLabel, "64");
    assert.equal(props.whoopStrainLabel, "12.4");
    assert.ok(props.whoopSleepProgress > 0.8);
    assert.ok(props.whoopStrainProgress > 0.5);
  });

  it("includes Whoop placeholders on header props by default", () => {
    const props = buildHomeGlanceHeaderProps(
      new Date(2026, 2, 27, 9, 0, 0),
      "file:///bg.jpg",
    );
    assert.equal(props.whoopVisible, false);
    assert.equal(props.whoopSleepLabel, "—");
  });

  it("builds sections props with selected tab, inbox slots, and icons", () => {
    const props = buildHomeGlanceSectionsProps(
      "inbox",
      "file:///forest.jpg",
      [
        {
          id: "task-1",
          title: "Review draft",
          meta: "Today",
          icon: "circle.lefthalf.filled",
          iconColor: "#e9c141",
          priorityIcon: "chart.bar.fill",
          priorityIconColor: "#1C1C1ECC",
        },
        {
          id: "task-2",
          title: "Call Alex",
          meta: "Tomorrow",
          icon: "circle",
          iconColor: "#e8e8e8",
          priorityIcon: "",
          priorityIconColor: "#1C1C1E66",
        },
      ],
      2,
      [
        {
          id: "task-9",
          title: "Ship widget",
          meta: "BacksterOS",
          icon: "circle.lefthalf.filled",
          iconColor: "#e9c141",
          priorityIcon: "chart.bar.fill",
          priorityIconColor: "#1C1C1ECC",
        },
      ],
      4,
    );
    assert.equal(props.selectedTab, "inbox");
    assert.equal(props.inboxCountLabel, "2/2");
    assert.equal(props.inboxIndicatorColor, "");
    assert.equal(props.inboxListUrl, "backsteros-v2://inbox");
    assert.equal(props.inboxUrl0, "backsteros-v2://inbox/task-1");
    assert.equal(props.inboxUrl1, "backsteros-v2://inbox/task-2");
    assert.equal(props.inboxUrl2, "");
    assert.equal(props.todayCountLabel, "1/4");
    assert.equal(props.todayListUrl, "backsteros-v2://tasks");
    assert.equal(props.todayUrl0, "backsteros-v2://tasks/task-9");
    assert.equal(props.todayTitle0, "Ship widget");
    assert.equal(props.todayUrl1, "");
    assert.equal(props.backgroundImageUri, "file:///forest.jpg");
    assert.equal(props.inboxTitle0, "Review draft");
    assert.equal(props.inboxMeta0, "Today");
    assert.equal(props.inboxIcon0, "circle.lefthalf.filled");
    assert.equal(props.inboxIconColor0, "#e9c141");
    assert.equal(props.inboxPriorityIcon0, "chart.bar.fill");
    assert.equal(props.inboxTitle1, "Call Alex");
    assert.equal(props.inboxPriorityIcon1, "");
    assert.equal(props.inboxTitle2, "");
    assert.equal(props.financeViewMoreUrl, "backsteros-v2://finance");
    assert.equal(props.financeCanGoNext, "0");
  });

  it("accepts the finance tab id", () => {
    const props = buildHomeGlanceSectionsProps("finance");
    assert.equal(props.selectedTab, "finance");
  });

  it("resolves inbox indicator tone priority orange > green > muted > none", () => {
    assert.equal(
      resolveInboxSidebarIndicatorTone({
        totalCount: 0,
        attentionCount: 0,
        updatedCount: 0,
      }),
      "none",
    );
    assert.equal(
      resolveInboxSidebarIndicatorTone({
        totalCount: 3,
        attentionCount: 0,
        updatedCount: 0,
      }),
      "muted",
    );
    assert.equal(
      resolveInboxSidebarIndicatorTone({
        totalCount: 3,
        attentionCount: 0,
        updatedCount: 2,
      }),
      "green",
    );
    assert.equal(
      resolveInboxSidebarIndicatorTone({
        totalCount: 3,
        attentionCount: 1,
        updatedCount: 2,
      }),
      "orange",
    );
    assert.equal(
      inboxSidebarIndicatorColor("orange"),
      INBOX_SIDEBAR_INDICATOR_COLORS.orange,
    );
    assert.equal(inboxSidebarIndicatorColor("none"), "");
  });

  it("sets inboxIndicatorColor on sections props from tone", () => {
    const props = buildHomeGlanceSectionsProps(
      "inbox",
      "",
      [],
      2,
      [],
      0,
      "green",
    );
    assert.equal(props.inboxIndicatorColor, INBOX_SIDEBAR_INDICATOR_COLORS.green);
  });

  it("round-trips finance month packs for widget navigation", () => {
    const months = [
      {
        monthKey: "2026-06",
        monthLabel: "June 2026",
        incomeTotalLabel: "€10,00",
        balanceTotalLabel: "+€4,00",
        balanceColor: "#22c55e",
        expenseTotalLabel: "€6,00",
        incomeSeries: "1,2,3",
        expenseSeries: "0,1,2",
        dayCount: 3,
      },
      {
        monthKey: "2026-07",
        monthLabel: "July 2026",
        incomeTotalLabel: "€20,00",
        balanceTotalLabel: "-€5,00",
        balanceColor: "#ef4444",
        expenseTotalLabel: "€25,00",
        incomeSeries: "4,5",
        expenseSeries: "6,7",
        dayCount: 2,
      },
    ];
    const pack = encodeHomeGlanceFinanceMonthsPack(months);
    const decoded = pack.split(FINANCE_PACK_ROW_SEP).map(decodeHomeGlanceFinanceMonthRow);
    assert.deepEqual(decoded, months);
    const props = buildHomeGlanceSectionsProps(
      "finance",
      "",
      [],
      0,
      [],
      0,
      "none",
      { months, selectedIndex: 1, viewMoreUrl: "backsteros-v2://finance" },
    );
    assert.equal(props.financeMonthKey, "2026-07");
    assert.equal(props.financeIndex, 1);
    assert.equal(props.financeCanGoPrev, "1");
    assert.equal(props.financeCanGoNext, "0");
    assert.equal(props.financeMonthCount, 2);
    assert.ok(props.financeMonthsPack.includes("2026-06"));
  });
});

import HomeGlanceHeaderWidget from "./home-glance-header-widget";
import HomeGlanceSectionsWidget, {
  reregisterHomeGlanceSectionsWidgetLayout,
} from "./home-glance-sections-widget";
import { ensureHomeGlanceBackgrounds } from "./ensure-home-glance-backgrounds";
import {
  buildHomeGlanceHeaderProps,
  buildHomeGlanceHeaderTimeline,
  buildHomeGlanceSectionsProps,
  clampHomeGlanceFinanceIndex,
  EMPTY_HOME_GLANCE_FINANCE,
  resolveHomeGlanceTab,
  type HomeGlanceFinanceInput,
  type HomeGlanceInboxItem,
  type HomeGlanceTab,
  type InboxSidebarIndicatorTone,
} from "./home-glance-model";
import { loadHomeGlanceFinance } from "./load-home-glance-finance";
import { loadHomeGlanceWeather } from "./load-home-glance-weather";
import { loadHomeGlanceWhoop } from "./load-home-glance-whoop";

type WhoopApiClient = {
  requestJson: <T>(path: string, init?: RequestInit) => Promise<T>;
};

/** Serialize refreshes so overlapping loads cannot clobber a fresher tap. */
let refreshChain: Promise<void> = Promise.resolve();

type SectionsInteractiveState = {
  selectedTab: HomeGlanceTab;
  financeIndex: number | null;
};

async function readSectionsInteractiveState(
  fallbackTab: HomeGlanceTab,
): Promise<SectionsInteractiveState> {
  try {
    const timeline = await HomeGlanceSectionsWidget.getTimeline();
    const props = timeline[0]?.props;
    const tab = resolveHomeGlanceTab(props?.selectedTab) ?? fallbackTab;
    const rawIndex = Number(props?.financeIndex);
    const financeIndex = Number.isFinite(rawIndex) ? rawIndex : null;
    return { selectedTab: tab, financeIndex };
  } catch {
    return { selectedTab: fallbackTab, financeIndex: null };
  }
}

/**
 * Refresh both home glance widgets (medium header + large sections).
 * Preserves the large widget's selected tab and finance month index across
 * refreshes (re-read after awaits so in-flight loads do not undo taps).
 */
export async function refreshHomeGlanceWidget(
  selectedTab?: HomeGlanceTab,
  inboxItems: HomeGlanceInboxItem[] = [],
  inboxTotalCount = 0,
  todayItems: HomeGlanceInboxItem[] = [],
  todayTotalCount = 0,
  apiClient?: WhoopApiClient | null,
  inboxIndicatorTone: InboxSidebarIndicatorTone = "none",
): Promise<void> {
  const run = async () => {
    const [backgrounds, weather, whoop, finance] = await Promise.all([
      ensureHomeGlanceBackgrounds(),
      loadHomeGlanceWeather(),
      loadHomeGlanceWhoop(apiClient),
      loadHomeGlanceFinance(apiClient),
    ]);

    // Re-read AFTER network/loaders so a tab/month tap during the await wins.
    const interactive = await readSectionsInteractiveState(
      selectedTab ?? "inbox",
    );
    const tab =
      selectedTab != null
        ? selectedTab
        : interactive.selectedTab;

    const loadedFinance: HomeGlanceFinanceInput =
      finance ?? EMPTY_HOME_GLANCE_FINANCE;
    const monthCount = loadedFinance.months.length;
    const selectedIndex =
      interactive.financeIndex != null
        ? clampHomeGlanceFinanceIndex(interactive.financeIndex, monthCount)
        : clampHomeGlanceFinanceIndex(
            loadedFinance.selectedIndex,
            monthCount,
          );
    const financeInput: HomeGlanceFinanceInput = {
      ...loadedFinance,
      selectedIndex,
    };

    const mediumBackgroundUri = backgrounds?.mediumBackgroundUri ?? "";
    const largeBackgroundUri = backgrounds?.largeBackgroundUri ?? "";

    const headerProps = buildHomeGlanceHeaderProps(
      new Date(),
      mediumBackgroundUri,
      weather,
      whoop,
    );
    HomeGlanceHeaderWidget.updateTimeline(
      buildHomeGlanceHeaderTimeline(mediumBackgroundUri, 12, weather, whoop),
    );
    HomeGlanceHeaderWidget.updateSnapshot(headerProps);
    HomeGlanceHeaderWidget.reload();

    const sectionsProps = buildHomeGlanceSectionsProps(
      tab,
      largeBackgroundUri,
      inboxItems,
      inboxTotalCount,
      todayItems,
      todayTotalCount,
      inboxIndicatorTone,
      financeInput,
    );
    // Layout rewrite only needed after widget source changes; keep for now so
    // post-EOF devices still recover without a reinstall.
    reregisterHomeGlanceSectionsWidgetLayout();
    HomeGlanceSectionsWidget.updateSnapshot(sectionsProps);
    HomeGlanceSectionsWidget.reload();
  };

  const next = refreshChain.then(run, run);
  refreshChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

import {
  SETTINGS_NAV_TABS,
  type SettingsTabId,
} from "@backsteros/ui";

/** Settings tabs for the agent console — omit product-only integrations. */
const DEVELOPMENT_EXCLUDED_SETTINGS_TABS = new Set<SettingsTabId>(["whoop"]);

export const DEVELOPMENT_SETTINGS_NAV_TABS = SETTINGS_NAV_TABS.filter(
  (tab) => !DEVELOPMENT_EXCLUDED_SETTINGS_TABS.has(tab.id),
);

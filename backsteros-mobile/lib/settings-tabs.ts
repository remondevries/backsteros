export type SettingsTabId =
  | "general"
  | "account"
  | "sync"
  | "api"
  | "cursor"
  | "whoop"
  | "storage";

export const DEFAULT_SETTINGS_TAB: SettingsTabId = "general";

export const SETTINGS_NAV_TABS: {
  id: SettingsTabId;
  label: string;
  description: string;
}[] = [
  {
    id: "general",
    label: "General",
    description: "App-wide preferences",
  },
  {
    id: "account",
    label: "Account",
    description: "Sign-in details and your default assignee",
  },
  {
    id: "sync",
    label: "Sync",
    description: "Cloud sync status and last sync time",
  },
  {
    id: "api",
    label: "API",
    description: "Revocable bearer tokens for the external REST API",
  },
  {
    id: "cursor",
    label: "Cursor",
    description: "Use Cursor with Backsteros",
  },
  {
    id: "whoop",
    label: "Whoop",
    description: "Recovery, sleep, and strain data for journal entries",
  },
  {
    id: "storage",
    label: "Storage",
    description: "Object storage for documents and letter PDFs",
  },
];

export function getSettingsTabMeta(tabId: SettingsTabId) {
  return SETTINGS_NAV_TABS.find((tab) => tab.id === tabId) ?? SETTINGS_NAV_TABS[0]!;
}

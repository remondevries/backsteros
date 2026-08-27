import { Platform } from "react-native";

export type SettingsTabId =
  | "general"
  | "account"
  | "api"
  | "cursor"
  | "github"
  | "email"
  | "moneybird"
  | "whoop"
  | "storage"
  | "server";

export const DEFAULT_SETTINGS_TAB: SettingsTabId = "general";

export const SETTINGS_NAV_TABS: {
  id: SettingsTabId;
  label: string;
  description: string;
  /** When true, only shown on iOS (iPhone + iPad). */
  iosOnly?: boolean;
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
    id: "github",
    label: "GitHub",
    description: "Connect personal and organization repositories",
  },
  {
    id: "email",
    label: "Email",
    description: "AgentMail API key, inboxes, and reply templates",
  },
  {
    id: "moneybird",
    label: "Moneybird",
    description: "Personal API token and administration for invoices",
  },
  {
    id: "whoop",
    label: "Whoop",
    description: "Recovery, sleep, and strain data for journal entries",
  },
  {
    id: "storage",
    label: "Storage",
    description: "Local Obsidian-style vault for documents and letter PDFs",
  },
  {
    id: "server",
    label: "Server",
    description: "Laptop agent sidecar (ACP chat over Tailscale)",
    iosOnly: true,
  },
];

/** Tabs visible on the current platform (Server is iOS-only). */
export function getVisibleSettingsNavTabs() {
  return SETTINGS_NAV_TABS.filter(
    (tab) => !tab.iosOnly || Platform.OS === "ios",
  );
}

export function getSettingsTabMeta(tabId: SettingsTabId) {
  return SETTINGS_NAV_TABS.find((tab) => tab.id === tabId) ?? SETTINGS_NAV_TABS[0]!;
}

export function isSettingsTabId(
  value: string,
  visibleOnly = false,
): value is SettingsTabId {
  const tabs = visibleOnly ? getVisibleSettingsNavTabs() : SETTINGS_NAV_TABS;
  return tabs.some((tab) => tab.id === value);
}

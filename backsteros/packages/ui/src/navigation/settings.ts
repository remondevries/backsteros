export type SettingsTabId =
  | "account"
  | "syncing"
  | "labels"
  | "document-properties"
  | "api"
  | "integrations"
  | "storage";

/** Settings → Syncing (conflict / replication UI; page is a stub for now). */
export const SETTINGS_SYNCING_HREF = "/settings/syncing";

/** Former per-vendor settings routes; redirect to Integrations. */
export const LEGACY_INTEGRATION_SETTINGS_TABS = [
  "cursor",
  "github",
  "transip",
  "cloudflare",
  "moneybird",
  "mapbox",
  "google-calendar",
  "email",
  "whoop",
] as const;

export type LegacyIntegrationSettingsTab =
  (typeof LEGACY_INTEGRATION_SETTINGS_TABS)[number];

/** Former General tab; preferences now live under Account. */
export const LEGACY_GENERAL_SETTINGS_TAB = "general";

export type SettingsTabGroup = "general" | "integration";

export const DEFAULT_SETTINGS_TAB: SettingsTabId = "account";

export const SETTINGS_TAB_GROUP_ORDER: SettingsTabGroup[] = [
  "general",
  "integration",
];

export const SETTINGS_NAV_TABS: {
  id: SettingsTabId;
  label: string;
  description: string;
  group: SettingsTabGroup;
  href: string;
  comingSoon?: boolean;
}[] = [
  {
    id: "account",
    label: "Account",
    description: "Your contact profile and account preferences",
    group: "general",
    href: "/settings/account",
  },
  {
    id: "syncing",
    label: "Syncing",
    description: "Cloud and local sync status, conflicts, and replication",
    group: "general",
    href: SETTINGS_SYNCING_HREF,
  },
  {
    id: "labels",
    label: "Labels",
    description: "Tags you can attach to any task. Groups only organize this list.",
    group: "general",
    href: "/settings/labels",
  },
  {
    id: "document-properties",
    label: "Document properties",
    description:
      "Types you can attach to knowledge and project documents. Property types appear on document rails — agents can only propose new types; you approve them here.",
    group: "general",
    href: "/settings/document-properties",
  },
  {
    id: "integrations",
    label: "Integrations",
    description: "Connect tools and turn them on or off",
    group: "integration",
    href: "/settings/integrations",
  },
  {
    id: "api",
    label: "API",
    description:
      "Revocable bearer tokens for the external REST API. Logs show lifecycle events plus recent requests on this core (newest ~2,000).",
    group: "integration",
    href: "/settings/api",
  },
  {
    id: "storage",
    label: "Storage",
    description: "Local Obsidian-style vault for documents and letter PDFs",
    group: "integration",
    href: "/settings/storage",
  },
];

const SETTINGS_NAV_SECTION_LABEL: Record<SettingsTabGroup, string> = {
  general: "General",
  integration: "Services",
};

export function getSettingsTabFromPath(pathname: string): SettingsTabId {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  // Legacy `/settings/api/:id` redirects to the list; treat as API tab.
  if (normalized === "/settings/api" || normalized.startsWith("/settings/api/")) {
    return "api";
  }
  const match = SETTINGS_NAV_TABS.find((tab) => normalized === tab.href);
  return match?.id ?? DEFAULT_SETTINGS_TAB;
}

/** @deprecated Per-key detail URLs redirect to the API keys list. */
export function getSettingsApiKeyIdFromPath(_pathname: string): string | null {
  return null;
}

export function getSettingsTabMeta(tabId: SettingsTabId) {
  return SETTINGS_NAV_TABS.find((tab) => tab.id === tabId) ?? SETTINGS_NAV_TABS[0]!;
}

export function getSettingsSectionLabel(group: SettingsTabGroup): string {
  return SETTINGS_NAV_SECTION_LABEL[group];
}

export function getDefaultSettingsHref(): string {
  return (
    SETTINGS_NAV_TABS.find((tab) => tab.id === DEFAULT_SETTINGS_TAB)?.href ??
    "/settings/account"
  );
}

/** Display hint for the open-settings keyboard shortcut (mac-oriented). */
export const SETTINGS_SHORTCUT_HINT = "⌘,";

export function isSettingsPath(pathname: string): boolean {
  return pathname === "/settings" || pathname.startsWith("/settings/");
}

export function isSettingsTabId(value: string): value is SettingsTabId {
  return SETTINGS_NAV_TABS.some((tab) => tab.id === value);
}

export function isLegacyIntegrationSettingsTab(
  value: string,
): value is LegacyIntegrationSettingsTab {
  return (LEGACY_INTEGRATION_SETTINGS_TABS as readonly string[]).includes(value);
}

export function getIntegrationsSettingsHref(
  open?: LegacyIntegrationSettingsTab | string | null,
): string {
  if (!open) return "/settings/integrations";
  return `/settings/integrations?open=${encodeURIComponent(open)}`;
}

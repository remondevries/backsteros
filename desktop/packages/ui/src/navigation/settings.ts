export type SettingsTabId =
  | "general"
  | "account"
  | "api"
  | "integrations"
  | "storage";

/** Former per-vendor settings routes; redirect to Integrations. */
export const LEGACY_INTEGRATION_SETTINGS_TABS = [
  "cursor",
  "github",
  "transip",
  "cloudflare",
  "moneybird",
  "mapbox",
  "email",
  "whoop",
] as const;

export type LegacyIntegrationSettingsTab =
  (typeof LEGACY_INTEGRATION_SETTINGS_TABS)[number];

export type SettingsTabGroup = "general" | "integration";

export const DEFAULT_SETTINGS_TAB: SettingsTabId = "general";

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
    id: "general",
    label: "General",
    description: "App-wide preferences",
    group: "general",
    href: "/settings/general",
  },
  {
    id: "account",
    label: "Account",
    description: "Sign-in details and your default assignee",
    group: "general",
    href: "/settings/account",
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
    description: "Revocable bearer tokens for the external REST API",
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
  integration: "Integrations",
};

export function getSettingsTabFromPath(pathname: string): SettingsTabId {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const match = SETTINGS_NAV_TABS.find((tab) => normalized === tab.href);
  return match?.id ?? DEFAULT_SETTINGS_TAB;
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
    "/settings/general"
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

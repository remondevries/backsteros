/** Workspace integrations shown on Settings → Integrations. */
export type WorkspaceIntegrationId =
  | "cursor"
  | "github"
  | "transip"
  | "cloudflare"
  | "moneybird"
  | "mapbox"
  | "email"
  | "whoop";

export type WorkspaceIntegrationMeta = {
  id: WorkspaceIntegrationId;
  title: string;
  description: string;
  /** Host used for Google s2 favicon (integrations-03 pattern). */
  faviconHost: string;
};

export const WORKSPACE_INTEGRATIONS: WorkspaceIntegrationMeta[] = [
  {
    id: "cursor",
    title: "Cursor",
    description: "Use Cursor with Backsteros",
    faviconHost: "cursor.com",
  },
  {
    id: "github",
    title: "GitHub",
    description: "Personal access token for commits and pull requests",
    faviconHost: "github.com",
  },
  {
    id: "transip",
    title: "TransIP",
    description: "Access token for Catalog Domains sync",
    faviconHost: "transip.nl",
  },
  {
    id: "cloudflare",
    title: "Cloudflare",
    description: "API token for DNS zone matching on Catalog Domains",
    faviconHost: "cloudflare.com",
  },
  {
    id: "moneybird",
    title: "Moneybird",
    description: "Sales invoices and bookkeeping for Finance",
    faviconHost: "moneybird.com",
  },
  {
    id: "mapbox",
    title: "Mapbox",
    description: "Geocode addresses and show location maps",
    faviconHost: "mapbox.com",
  },
  {
    id: "email",
    title: "E-mail",
    description: "AgentMail inboxes for incoming messages in Inbox",
    faviconHost: "agentmail.to",
  },
  {
    id: "whoop",
    title: "Whoop",
    description: "Recovery, sleep, and strain data for journal entries",
    faviconHost: "whoop.com",
  },
];

const INTEGRATION_IDS = new Set<string>(
  WORKSPACE_INTEGRATIONS.map((entry) => entry.id),
);

export function isWorkspaceIntegrationId(
  value: string,
): value is WorkspaceIntegrationId {
  return INTEGRATION_IDS.has(value);
}

export function getWorkspaceIntegrationMeta(
  id: WorkspaceIntegrationId,
): WorkspaceIntegrationMeta {
  return (
    WORKSPACE_INTEGRATIONS.find((entry) => entry.id === id) ??
    WORKSPACE_INTEGRATIONS[0]!
  );
}

/** Workspace settings key for per-integration enable toggles. */
export const INTEGRATION_ENABLED_SETTINGS_KEY = "integrationEnabled";

export type IntegrationEnabledMap = Partial<
  Record<WorkspaceIntegrationId, boolean>
>;

export function parseIntegrationEnabledMap(
  settings: Record<string, unknown> | null | undefined,
): IntegrationEnabledMap {
  const raw = settings?.[INTEGRATION_ENABLED_SETTINGS_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const next: IntegrationEnabledMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isWorkspaceIntegrationId(key) || typeof value !== "boolean") continue;
    next[key] = value;
  }
  return next;
}

export function isIntegrationEnabled(
  map: IntegrationEnabledMap,
  id: WorkspaceIntegrationId,
): boolean {
  return map[id] !== false;
}

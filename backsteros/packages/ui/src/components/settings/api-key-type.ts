import {
  AGENT_API_KEY_SCOPES,
  AGENT_KEY_SCOPES,
  APPLICATIONS_API_KEY_MARKER_SCOPE,
  APPLICATIONS_API_KEY_SCOPES,
  hasFullAccessApiKeyScopes,
  isAccessApiKey,
  isApplicationsApiKey,
  isExclusiveDoorApiKeyScopes,
  type ApiKeyScope,
} from "@backsteros/contracts";

/** Key type tabs — maps to scoped create + table filter. */
export type ApiKeyTypeTab =
  | "agent"
  | "access"
  | "applications"
  | "tv"
  | "carddav";

const API_KEY_TYPE_TABS = [
  "agent",
  "access",
  "applications",
  "tv",
  "carddav",
] as const satisfies readonly ApiKeyTypeTab[];

export function isApiKeyTypeTab(value: unknown): value is ApiKeyTypeTab {
  return (
    typeof value === "string" &&
    (API_KEY_TYPE_TABS as readonly string[]).includes(value)
  );
}
export const TV_API_KEY_SCOPE = "tv.today_counts" as const satisfies ApiKeyScope;
export const CARDDAV_API_KEY_SCOPE = "carddav" as const satisfies ApiKeyScope;
export const APPLICATION_API_KEY_SCOPE =
  APPLICATIONS_API_KEY_MARKER_SCOPE satisfies ApiKeyScope;

export {
  AGENT_API_KEY_SCOPES,
  AGENT_KEY_SCOPES,
  APPLICATIONS_API_KEY_SCOPES,
  hasFullAccessApiKeyScopes,
  isAccessApiKey,
  isApplicationsApiKey,
  isExclusiveDoorApiKeyScopes,
};

const AGENT_SCOPE_SET = new Set<string>(AGENT_API_KEY_SCOPES);

/**
 * Classify a key for the Agent / Access / Applications / TV / Contacts sync tabs.
 * TV and CardDAV remain exclusive single-scope doors. Applications keys carry
 * the `applications` marker plus data scopes (no settings). Access keys have
 * generic scopes and no contact. Agent keys have generic scopes and a contact.
 */
export function classifyApiKeyType(apiKey: {
  scopes: readonly string[];
  contactId: string | null;
}): ApiKeyTypeTab | null {
  if (isExclusiveDoorApiKeyScopes(apiKey.scopes)) {
    const only = apiKey.scopes[0];
    if (only === TV_API_KEY_SCOPE) return "tv";
    if (only === CARDDAV_API_KEY_SCOPE) return "carddav";
  }
  if (isApplicationsApiKey(apiKey)) return "applications";
  if (apiKey.scopes.some((scope) => AGENT_SCOPE_SET.has(scope))) {
    return apiKey.contactId == null ? "access" : "agent";
  }
  return null;
}

export function scopesForApiKeyTab(tab: ApiKeyTypeTab): readonly string[] {
  switch (tab) {
    case "applications":
      return [...APPLICATIONS_API_KEY_SCOPES, APPLICATION_API_KEY_SCOPE];
    case "tv":
      return [TV_API_KEY_SCOPE];
    case "carddav":
      return [CARDDAV_API_KEY_SCOPE];
    case "access":
      return AGENT_API_KEY_SCOPES;
    case "agent":
      return AGENT_KEY_SCOPES;
  }
}

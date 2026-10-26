import {
  AGENT_API_KEY_SCOPES,
  AGENT_KEY_SCOPES,
  hasFullAccessApiKeyScopes,
  isAccessApiKey,
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

export const TV_API_KEY_SCOPE = "tv.today_counts" as const satisfies ApiKeyScope;
export const CARDDAV_API_KEY_SCOPE = "carddav" as const satisfies ApiKeyScope;
export const APPLICATION_API_KEY_SCOPE =
  "applications" as const satisfies ApiKeyScope;

export {
  AGENT_API_KEY_SCOPES,
  AGENT_KEY_SCOPES,
  hasFullAccessApiKeyScopes,
  isAccessApiKey,
  isExclusiveDoorApiKeyScopes,
};

const AGENT_SCOPE_SET = new Set<string>(AGENT_API_KEY_SCOPES);

/**
 * Classify a key for the Agent / Access / Applications / TV / Contacts sync tabs.
 * Applications, TV, and CardDAV are exclusive single-scope doors. Access keys
 * have at least one generic read/write scope and no contact (machine/owner).
 * Agent keys have generic scopes and a contact.
 */
export function classifyApiKeyType(apiKey: {
  scopes: readonly string[];
  contactId: string | null;
}): ApiKeyTypeTab | null {
  if (isExclusiveDoorApiKeyScopes(apiKey.scopes)) {
    const only = apiKey.scopes[0];
    if (only === APPLICATION_API_KEY_SCOPE) return "applications";
    if (only === TV_API_KEY_SCOPE) return "tv";
    if (only === CARDDAV_API_KEY_SCOPE) return "carddav";
  }
  if (apiKey.scopes.some((scope) => AGENT_SCOPE_SET.has(scope))) {
    return apiKey.contactId == null ? "access" : "agent";
  }
  return null;
}

export function scopesForApiKeyTab(tab: ApiKeyTypeTab): readonly string[] {
  switch (tab) {
    case "applications":
      return [APPLICATION_API_KEY_SCOPE];
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

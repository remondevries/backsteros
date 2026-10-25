"use client";

import { API_KEY_SCOPES, type ApiKeyScope } from "@backsteros/contracts";

import { PolishedCheckbox } from "../shared/polished-checkbox.js";
import type { SettingsApiKeyItem } from "./api-keys-settings-section-view.js";

const TV_API_KEY_SCOPE = "tv.today_counts" as const satisfies ApiKeyScope;
const CARDDAV_API_KEY_SCOPE = "carddav" as const satisfies ApiKeyScope;
const APPLICATION_API_KEY_SCOPE = "applications" as const satisfies ApiKeyScope;
const EXCLUSIVE_API_KEY_SCOPES = new Set<string>([
  TV_API_KEY_SCOPE,
  CARDDAV_API_KEY_SCOPE,
  APPLICATION_API_KEY_SCOPE,
]);
const AGENT_API_KEY_SCOPES = API_KEY_SCOPES.filter(
  (
    scope,
  ): scope is Exclude<
    ApiKeyScope,
    | typeof TV_API_KEY_SCOPE
    | typeof CARDDAV_API_KEY_SCOPE
    | typeof APPLICATION_API_KEY_SCOPE
  > => !EXCLUSIVE_API_KEY_SCOPES.has(scope),
);
const AGENT_SCOPE_SET = new Set<string>(AGENT_API_KEY_SCOPES);

function classifyApiKeyType(
  apiKey: Pick<SettingsApiKeyItem, "scopes" | "contactId">,
): "agent" | "applications" | "tv" | "carddav" | null {
  if (
    apiKey.scopes.length === 1 &&
    apiKey.scopes[0] === APPLICATION_API_KEY_SCOPE
  ) {
    return "applications";
  }
  if (apiKey.scopes.length === 1 && apiKey.scopes[0] === TV_API_KEY_SCOPE) {
    return "tv";
  }
  if (
    apiKey.scopes.length === 1 &&
    apiKey.scopes[0] === CARDDAV_API_KEY_SCOPE
  ) {
    return "carddav";
  }
  if (apiKey.scopes.some((scope) => AGENT_SCOPE_SET.has(scope))) {
    return "agent";
  }
  return null;
}

export type ApiKeyDetailViewProps = {
  apiKey: SettingsApiKeyItem;
  /** Inline expand under a list row — no back chrome / duplicate header. */
  embedded?: boolean;
  onBack?: () => void;
};

export function ApiKeyDetailView({
  apiKey,
  embedded = false,
  onBack,
}: ApiKeyDetailViewProps) {
  const keyType = classifyApiKeyType(apiKey);

  const scopeList =
    keyType === "agent"
      ? AGENT_API_KEY_SCOPES
      : keyType === "applications"
        ? ([APPLICATION_API_KEY_SCOPE] as const)
        : keyType === "tv"
          ? ([TV_API_KEY_SCOPE] as const)
          : keyType === "carddav"
            ? ([CARDDAV_API_KEY_SCOPE] as const)
            : apiKey.scopes;

  const body = (
    <div className="settings-field api-key-detail-field api-key-detail-scopes">
      <div className="api-key-detail-scopes-label">
        <span>Scopes</span>
      </div>
      <div className="api-key-scope-grid" role="group" aria-label="Scopes">
        {scopeList.map((scope) => {
          const checked = apiKey.scopes.includes(scope);
          return (
            <label key={scope} className="api-key-scope-option">
              <PolishedCheckbox
                checked={checked}
                disabled
                ariaLabel={`Scope ${scope}${checked ? " granted" : " not granted"}`}
              />
              <span>{scope}</span>
            </label>
          );
        })}
      </div>
    </div>
  );

  if (embedded) {
    return <div className="api-key-expand-panel">{body}</div>;
  }

  return (
    <div className="settings-api-key-detail">
      {onBack ? (
        <button type="button" className="api-key-detail-back" onClick={onBack}>
          ← Back to API keys
        </button>
      ) : null}
      <section className="settings-card api-key-detail-card">{body}</section>
    </div>
  );
}

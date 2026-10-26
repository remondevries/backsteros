"use client";

import { PolishedCheckbox } from "../shared/polished-checkbox.js";
import type { SettingsApiKeyItem } from "./api-keys-settings-section-view.js";
import {
  AGENT_API_KEY_SCOPES,
  AGENT_KEY_SCOPES,
  APPLICATION_API_KEY_SCOPE,
  CARDDAV_API_KEY_SCOPE,
  TV_API_KEY_SCOPE,
  classifyApiKeyType,
  hasFullAccessApiKeyScopes,
} from "./api-key-type.js";

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
  const fullOwnerAccess =
    keyType === "access" && hasFullAccessApiKeyScopes(apiKey.scopes);

  const scopeList =
    keyType === "access"
      ? AGENT_API_KEY_SCOPES
      : keyType === "agent"
        ? AGENT_KEY_SCOPES
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
        <span>{fullOwnerAccess ? "Full owner access" : "Scopes"}</span>
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

"use client";

import { useEffect, useState } from "react";

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
import { SettingsSecretField } from "./settings-secret-field.js";

/** Linked agents-table webhook state for an Agent API key (OS-152). */
export type AgentWebhookSettings = {
  agentId: string | null;
  webhookUrl: string | null;
  webhookSecretConfigured: boolean;
};

export type ApiKeyDetailViewProps = {
  apiKey: SettingsApiKeyItem;
  /** Inline expand under a list row — no back chrome / duplicate header. */
  embedded?: boolean;
  onBack?: () => void;
  /**
   * When set on an Agent key, show webhook URL + write-only secret above Scopes
   * (this view is only mounted while the row is expanded).
   */
  agentWebhook?: AgentWebhookSettings | null;
  onSaveAgentWebhook?: (input: {
    webhookUrl?: string | null;
    webhookSecret?: string;
  }) => Promise<AgentWebhookSettings | null>;
  onTestAgentWebhook?: (
    agentId: string,
  ) => Promise<{ ok: boolean; error: string | null }>;
};

export function ApiKeyDetailView({
  apiKey,
  embedded = false,
  onBack,
  agentWebhook = null,
  onSaveAgentWebhook,
  onTestAgentWebhook,
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

  const showWebhook =
    keyType === "agent" && Boolean(onSaveAgentWebhook);

  const [webhookUrl, setWebhookUrl] = useState(
    agentWebhook?.webhookUrl ?? "",
  );
  const [secretConfigured, setSecretConfigured] = useState(
    Boolean(agentWebhook?.webhookSecretConfigured),
  );
  const [linkedAgentId, setLinkedAgentId] = useState<string | null>(
    agentWebhook?.agentId ?? null,
  );
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const [webhookTestMessage, setWebhookTestMessage] = useState<string | null>(
    null,
  );
  const [webhookTestOk, setWebhookTestOk] = useState<boolean | null>(null);

  useEffect(() => {
    setWebhookUrl(agentWebhook?.webhookUrl ?? "");
    setSecretConfigured(Boolean(agentWebhook?.webhookSecretConfigured));
    setLinkedAgentId(agentWebhook?.agentId ?? null);
    setWebhookError(null);
    setWebhookTestMessage(null);
    setWebhookTestOk(null);
  }, [
    agentWebhook?.agentId,
    agentWebhook?.webhookUrl,
    agentWebhook?.webhookSecretConfigured,
    apiKey.id,
  ]);

  async function runWebhookTest(agentId: string): Promise<void> {
    if (!onTestAgentWebhook) return;
    setTestingWebhook(true);
    setWebhookTestMessage(null);
    setWebhookTestOk(null);
    try {
      const result = await onTestAgentWebhook(agentId);
      setWebhookTestOk(result.ok);
      setWebhookTestMessage(
        result.ok
          ? "Webhook test delivered."
          : result.error?.trim() || "Webhook test failed.",
      );
    } finally {
      setTestingWebhook(false);
    }
  }

  async function persistWebhook(input: {
    webhookUrl?: string | null;
    webhookSecret?: string;
  }): Promise<boolean> {
    if (!onSaveAgentWebhook) return false;
    setSavingWebhook(true);
    setWebhookError(null);
    setWebhookTestMessage(null);
    setWebhookTestOk(null);
    try {
      const saved = await onSaveAgentWebhook(input);
      if (!saved) {
        setWebhookError("Couldn’t save webhook settings. Try again.");
        return false;
      }
      setLinkedAgentId(saved.agentId);
      if (input.webhookSecret !== undefined) {
        setSecretConfigured(input.webhookSecret.trim().length > 0);
      }
      if (saved.webhookUrl !== undefined && saved.webhookUrl !== null) {
        setWebhookUrl(saved.webhookUrl);
      }
      setSecretConfigured(saved.webhookSecretConfigured);
      const shouldTest =
        Boolean(onTestAgentWebhook) &&
        Boolean(saved.agentId) &&
        Boolean(saved.webhookUrl?.trim()) &&
        saved.webhookSecretConfigured;
      if (shouldTest && saved.agentId) {
        await runWebhookTest(saved.agentId);
      }
      return true;
    } finally {
      setSavingWebhook(false);
    }
  }

  async function saveWebhookUrl() {
    const next = webhookUrl.trim() || null;
    const current = agentWebhook?.webhookUrl ?? null;
    if (next === current) return;
    await persistWebhook({ webhookUrl: next });
  }

  const webhookBusy = savingWebhook || testingWebhook;

  const webhookBlock = showWebhook ? (
    <div className="api-key-agent-webhook">
      <label className="settings-field api-key-detail-field">
        <span>Webhook URL</span>
        <input
          value={webhookUrl}
          onChange={(event) => setWebhookUrl(event.target.value)}
          onBlur={() => void saveWebhookUrl()}
          placeholder="https://…"
          autoComplete="off"
          disabled={webhookBusy}
        />
      </label>
      <div className="settings-field api-key-detail-field">
        <span>Webhook secret</span>
        <SettingsSecretField
          configured={secretConfigured}
          emptyPlaceholder="Paste a new secret"
          saving={savingWebhook}
          disabled={webhookBusy}
          autoComplete="new-password"
          onSave={async (value) => {
            await persistWebhook({ webhookSecret: value });
          }}
        />
      </div>
      {onTestAgentWebhook && linkedAgentId ? (
        <div className="api-key-agent-webhook-test">
          <button
            type="button"
            className="api-key-create-cancel"
            disabled={webhookBusy || !webhookUrl.trim() || !secretConfigured}
            onClick={() => void runWebhookTest(linkedAgentId)}
          >
            {testingWebhook ? "Testing…" : "Test webhook"}
          </button>
          {webhookTestMessage ? (
            <p
              className={
                webhookTestOk
                  ? "api-key-webhook-test-ok"
                  : "api-key-row-error"
              }
              role="status"
            >
              {webhookTestMessage}
            </p>
          ) : null}
        </div>
      ) : null}
      {webhookError ? (
        <p className="api-key-row-error" role="alert">
          {webhookError}
        </p>
      ) : null}
    </div>
  ) : null;

  const scopesBlock = (
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

  const body = (
    <>
      {webhookBlock}
      {scopesBlock}
    </>
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

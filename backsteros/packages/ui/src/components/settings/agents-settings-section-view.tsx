"use client";

import { useMemo, useState } from "react";

import {
  buildContactDropdownOptions,
  DROPDOWN_NONE_VALUE,
  type AssigneeDropdownContact,
} from "../dropdowns/dropdown-options.js";
import { SearchableDropdown } from "../dropdowns/searchable-dropdown.js";
import { PolishedCheckbox } from "../shared/polished-checkbox.js";
import { SettingsContentHeader } from "./settings-content-header.js";

export type SettingsAgentItem = {
  id: string;
  name: string;
  contactId: string | null;
  apiKeyId: string | null;
  avatarUrl: string | null;
  role: string | null;
  enabled: boolean;
  webhookUrl: string | null;
  webhookSecretConfigured: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SettingsAgentApiKeyOption = {
  id: string;
  name: string;
  contactId: string | null;
};

export type AgentsSettingsSectionViewProps = {
  title?: string;
  description?: string;
  agents: SettingsAgentItem[];
  contacts?: readonly AssigneeDropdownContact[];
  apiKeys?: readonly SettingsAgentApiKeyOption[];
  loading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  onCreate?: (input: {
    name: string;
    contactId: string | null;
    apiKeyId: string | null;
    role: string | null;
    enabled: boolean;
    webhookUrl: string | null;
    webhookSecret?: string;
  }) => Promise<boolean>;
  onUpdate?: (
    id: string,
    patch: {
      name?: string;
      contactId?: string | null;
      apiKeyId?: string | null;
      role?: string | null;
      enabled?: boolean;
      webhookUrl?: string | null;
      webhookSecret?: string;
    },
  ) => Promise<boolean>;
  onDelete?: (id: string) => Promise<boolean>;
};

type Draft = {
  name: string;
  contactId: string | null;
  apiKeyId: string | null;
  role: string;
  enabled: boolean;
  webhookUrl: string;
  webhookSecret: string;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  contactId: null,
  apiKeyId: null,
  role: "",
  enabled: true,
  webhookUrl: "",
  webhookSecret: "",
};

/**
 * Settings → API → Agents: list/add/edit agents and write-only webhook secrets.
 */
export function AgentsSettingsSectionView({
  title = "Agents",
  description = "Chat agents with per-agent webhook URL and secret. The secret is write-only — set or replace it; it is never shown again.",
  agents,
  contacts = [],
  apiKeys = [],
  loading = false,
  errorMessage = null,
  onRetry,
  onCreate,
  onUpdate,
  onDelete,
}: AgentsSettingsSectionViewProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const contactOptions = useMemo(
    () => buildContactDropdownOptions([...contacts]),
    [contacts],
  );

  const apiKeyOptions = useMemo(
    () => [
      { value: DROPDOWN_NONE_VALUE, label: "No API key" },
      ...apiKeys.map((key) => ({
        value: key.id,
        label: key.name,
      })),
    ],
    [apiKeys],
  );

  function startCreate() {
    setCreating(true);
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setLocalError(null);
  }

  function startEdit(agent: SettingsAgentItem) {
    setCreating(false);
    setEditingId(agent.id);
    setDraft({
      name: agent.name,
      contactId: agent.contactId,
      apiKeyId: agent.apiKeyId,
      role: agent.role ?? "",
      enabled: agent.enabled,
      webhookUrl: agent.webhookUrl ?? "",
      webhookSecret: "",
    });
    setLocalError(null);
  }

  function cancelForm() {
    setCreating(false);
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setLocalError(null);
  }

  async function save() {
    if (!draft.name.trim()) {
      setLocalError("Name is required");
      return;
    }
    setSaving(true);
    setLocalError(null);
    try {
      if (creating) {
        const ok = await onCreate?.({
          name: draft.name.trim(),
          contactId: draft.contactId,
          apiKeyId: draft.apiKeyId,
          role: draft.role.trim() || null,
          enabled: draft.enabled,
          webhookUrl: draft.webhookUrl.trim() || null,
          webhookSecret: draft.webhookSecret.trim() || undefined,
        });
        if (ok) cancelForm();
        else setLocalError("Could not create agent");
      } else if (editingId) {
        const patch: Parameters<NonNullable<typeof onUpdate>>[1] = {
          name: draft.name.trim(),
          contactId: draft.contactId,
          apiKeyId: draft.apiKeyId,
          role: draft.role.trim() || null,
          enabled: draft.enabled,
          webhookUrl: draft.webhookUrl.trim() || null,
        };
        if (draft.webhookSecret.trim()) {
          patch.webhookSecret = draft.webhookSecret.trim();
        }
        const ok = await onUpdate?.(editingId, patch);
        if (ok) cancelForm();
        else setLocalError("Could not update agent");
      }
    } finally {
      setSaving(false);
    }
  }

  const formOpen = creating || editingId != null;

  return (
    <section className="settings-section agents-settings">
      <SettingsContentHeader
        title={title}
        description={description}
        trailing={
          !formOpen && onCreate ? (
            <button
              type="button"
              className="button button--secondary"
              onClick={startCreate}
            >
              Add agent
            </button>
          ) : null
        }
      />

      {errorMessage ? (
        <p className="settings-inline-error" role="alert">
          {errorMessage}{" "}
          {onRetry ? (
            <button type="button" className="button-link" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </p>
      ) : null}
      {localError ? (
        <p className="settings-inline-error" role="alert">
          {localError}
        </p>
      ) : null}

      {formOpen ? (
        <div className="agents-settings__form">
          <label className="settings-field">
            <span className="settings-field__label">Name</span>
            <input
              className="settings-field__input"
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Sander"
            />
          </label>
          <label className="settings-field">
            <span className="settings-field__label">Role</span>
            <input
              className="settings-field__input"
              value={draft.role}
              onChange={(event) =>
                setDraft((current) => ({ ...current, role: event.target.value }))
              }
              placeholder="Grok Bot agent"
            />
          </label>
          <div className="settings-field">
            <span className="settings-field__label">Contact</span>
            <SearchableDropdown
              value={draft.contactId ?? DROPDOWN_NONE_VALUE}
              options={contactOptions}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  contactId: value === DROPDOWN_NONE_VALUE ? null : value,
                }))
              }
              ariaLabel="Agent contact"
            />
          </div>
          <div className="settings-field">
            <span className="settings-field__label">Reply API key</span>
            <SearchableDropdown
              value={draft.apiKeyId ?? DROPDOWN_NONE_VALUE}
              options={apiKeyOptions}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  apiKeyId: value === DROPDOWN_NONE_VALUE ? null : value,
                }))
              }
              ariaLabel="Agent API key for replies"
            />
          </div>
          <label className="settings-field">
            <span className="settings-field__label">Webhook URL</span>
            <input
              className="settings-field__input"
              value={draft.webhookUrl}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  webhookUrl: event.target.value,
                }))
              }
              placeholder="https://…"
              autoComplete="off"
            />
          </label>
          <label className="settings-field">
            <span className="settings-field__label">
              Webhook secret
              {editingId
                ? agents.find((agent) => agent.id === editingId)
                    ?.webhookSecretConfigured
                  ? " (leave blank to keep current)"
                  : " (optional)"
                : " (optional)"}
            </span>
            <input
              className="settings-field__input"
              type="password"
              value={draft.webhookSecret}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  webhookSecret: event.target.value,
                }))
              }
              placeholder={
                editingId &&
                agents.find((agent) => agent.id === editingId)
                  ?.webhookSecretConfigured
                  ? "••••••••••••"
                  : "Paste a new secret"
              }
              autoComplete="new-password"
            />
          </label>
          <label className="agents-settings__enabled">
            <PolishedCheckbox
              checked={draft.enabled}
              ariaLabel="Agent enabled"
              onCheckedChange={(checked) =>
                setDraft((current) => ({ ...current, enabled: checked }))
              }
            />
            <span>Enabled</span>
          </label>
          <div className="agents-settings__form-actions">
            <button
              type="button"
              className="button button--secondary"
              onClick={cancelForm}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button button--primary"
              onClick={() => void save()}
              disabled={saving}
            >
              {saving ? "Saving…" : creating ? "Create" : "Save"}
            </button>
          </div>
        </div>
      ) : null}

      {loading && agents.length === 0 ? (
        <p className="settings-muted">Loading agents…</p>
      ) : agents.length === 0 && !formOpen ? (
        <p className="settings-muted">
          No agents yet. Add Sander or another Grok Bot persona to start.
        </p>
      ) : (
        <ul className="agents-settings__list">
          {agents.map((agent) => (
            <li key={agent.id} className="agents-settings__row">
              <div className="agents-settings__row-main">
                <strong>{agent.name}</strong>
                {agent.role ? (
                  <span className="settings-muted"> · {agent.role}</span>
                ) : null}
                <div className="agents-settings__meta settings-muted">
                  {agent.enabled ? "Enabled" : "Disabled"}
                  {" · "}
                  {agent.webhookUrl ? "Webhook set" : "No webhook URL"}
                  {" · "}
                  {agent.webhookSecretConfigured
                    ? "Secret configured"
                    : "No secret"}
                </div>
              </div>
              <div className="agents-settings__row-actions">
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => startEdit(agent)}
                  disabled={formOpen}
                >
                  Edit
                </button>
                {onDelete ? (
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => void onDelete(agent.id)}
                    disabled={formOpen}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";

import {
  buildContactDropdownOptions,
  DROPDOWN_NONE_VALUE,
  type AssigneeDropdownContact,
} from "../dropdowns/dropdown-options.js";
import {
  SearchableDropdown,
  type SearchableDropdownOption,
} from "../dropdowns/searchable-dropdown.js";

export type SettingsApiKeyItem = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  contactId: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedAddress: string | null;
  createdAt: string;
};

export type SettingsApiKeyAuditLogItem = {
  id: string;
  apiKeyId: string | null;
  apiKeyName: string;
  action: "created" | "revoked" | "rotated" | "expiry_updated";
  actorKind: string | null;
  address: string | null;
  createdAt: string;
};

export type SettingsApiKeyContactOption = AssigneeDropdownContact;

export type ApiKeyExpiryPreset = "never" | "30d" | "90d" | "1y";

export type ApiKeysSettingsSectionViewProps = {
  apiKeys: SettingsApiKeyItem[];
  auditLogs?: SettingsApiKeyAuditLogItem[];
  contacts?: SettingsApiKeyContactOption[];
  loading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  onCreate?: (
    name: string,
    contactId: string | null,
    expiresAt: string | null,
  ) => Promise<string | null>;
  onRename?: (id: string, name: string) => Promise<boolean>;
  onSetContact?: (id: string, contactId: string | null) => Promise<boolean>;
  onSetExpiry?: (id: string, expiresAt: string | null) => Promise<boolean>;
  onRotate?: (id: string) => Promise<string | null>;
  onRevoke?: (id: string) => Promise<boolean>;
};

function formatDateTime(value: string): string {
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const time = Date.parse(expiresAt);
  return Number.isFinite(time) && time <= Date.now();
}

export function expiryPresetToIso(preset: ApiKeyExpiryPreset): string | null {
  if (preset === "never") return null;
  const days = preset === "30d" ? 30 : preset === "90d" ? 90 : 365;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function ApiKeyContactDropdown({
  value,
  options,
  disabled,
  ariaLabel,
  searchPlaceholder,
  onChange,
}: {
  value: string | null;
  options: SearchableDropdownOption<string>[];
  disabled?: boolean;
  ariaLabel: string;
  searchPlaceholder: string;
  onChange: (contactId: string | null) => void;
}) {
  return (
    <SearchableDropdown
      value={value ?? DROPDOWN_NONE_VALUE}
      options={options}
      onChange={(next) => {
        onChange(next === DROPDOWN_NONE_VALUE ? null : next);
      }}
      disabled={disabled}
      searchPlaceholder={searchPlaceholder}
      ariaLabel={ariaLabel}
    />
  );
}

function ApiKeyRow({
  apiKey,
  contacts,
  contactOptions,
  onRename,
  onSetContact,
  onSetExpiry,
  onRotate,
  onRevoke,
}: {
  apiKey: SettingsApiKeyItem;
  contacts: SettingsApiKeyContactOption[];
  contactOptions: SearchableDropdownOption<string>[];
  onRename?: (id: string, name: string) => Promise<boolean>;
  onSetContact?: (id: string, contactId: string | null) => Promise<boolean>;
  onSetExpiry?: (id: string, expiresAt: string | null) => Promise<boolean>;
  onRotate?: (id: string) => Promise<string | null>;
  onRevoke?: (id: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(apiKey.name);
  const [saving, setSaving] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotatedSecret, setRotatedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const expired = isExpired(apiKey.expiresAt);

  useEffect(() => {
    if (!editing) setName(apiKey.name);
  }, [apiKey.name, editing]);

  const contactName =
    contacts.find((contact) => contact.id === apiKey.contactId)?.name ?? null;

  async function saveName() {
    const nextName = name.trim();
    if (!nextName || nextName === apiKey.name || !onRename) {
      setEditing(false);
      setName(apiKey.name);
      return;
    }
    setSaving(true);
    const ok = await onRename(apiKey.id, nextName);
    setSaving(false);
    if (ok) setEditing(false);
  }

  async function revokeKey() {
    if (!onRevoke) return;
    setRevoking(true);
    const ok = await onRevoke(apiKey.id);
    setRevoking(false);
    if (!ok) setConfirmRevoke(false);
  }

  async function rotateKey() {
    if (!onRotate) return;
    setRotating(true);
    setCopied(false);
    const secret = await onRotate(apiKey.id);
    setRotating(false);
    if (secret) {
      setRotatedSecret(secret);
      setConfirmRotate(false);
    }
  }

  async function copySecret() {
    if (!rotatedSecret) return;
    try {
      await navigator.clipboard.writeText(rotatedSecret);
      setCopied(true);
    } catch {
      // ignore
    }
  }

  return (
    <div className={`api-key-row${expired ? " api-key-row-expired" : ""}`}>
      <div className="api-key-row-main">
        {editing ? (
          <form
            className="api-key-rename-form"
            onSubmit={(event) => {
              event.preventDefault();
              void saveName();
            }}
          >
            <input
              autoFocus
              value={name}
              disabled={saving}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setEditing(false);
                  setName(apiKey.name);
                }
              }}
              aria-label="API key name"
              className="api-key-rename-input"
            />
            <button
              type="submit"
              className="api-key-action-btn"
              disabled={saving || !name.trim()}
            >
              Save
            </button>
            <button
              type="button"
              className="api-key-action-btn"
              disabled={saving}
              onClick={() => {
                setEditing(false);
                setName(apiKey.name);
              }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <>
            <strong className="api-key-name">
              {apiKey.name}
              {expired ? (
                <span className="api-key-expired-badge">Expired</span>
              ) : null}
            </strong>
            <p className="api-key-meta">
              <code>{apiKey.prefix}…</code>
              <span aria-hidden="true">·</span>
              <span>{apiKey.scopes.join(", ")}</span>
              <span aria-hidden="true">·</span>
              <span>Created {formatDateTime(apiKey.createdAt)}</span>
              <span aria-hidden="true">·</span>
              <span>
                {apiKey.expiresAt
                  ? `Expires ${formatDateTime(apiKey.expiresAt)}`
                  : "No expiry"}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {apiKey.lastUsedAt
                  ? `Last used ${formatDateTime(apiKey.lastUsedAt)}${
                      apiKey.lastUsedAddress
                        ? ` from ${apiKey.lastUsedAddress}`
                        : ""
                    }`
                  : "Never used"}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {contactName
                  ? `Contact ${contactName}`
                  : "No contact attached"}
              </span>
            </p>
            {onSetContact && contacts.length > 0 ? (
              <div className="api-key-contact-field">
                <span>Contact</span>
                <ApiKeyContactDropdown
                  value={apiKey.contactId}
                  options={contactOptions}
                  ariaLabel={`Contact for ${apiKey.name}`}
                  searchPlaceholder="Set contact…"
                  onChange={(next) => {
                    void onSetContact(apiKey.id, next);
                  }}
                />
              </div>
            ) : null}
            {onSetExpiry ? (
              <div className="api-key-expiry-field">
                <span>Expiry</span>
                <select
                  aria-label={`Expiry for ${apiKey.name}`}
                  value={
                    apiKey.expiresAt
                      ? "custom"
                      : "never"
                  }
                  onChange={(event) => {
                    const value = event.target.value as
                      | ApiKeyExpiryPreset
                      | "custom";
                    if (value === "custom") return;
                    void onSetExpiry(apiKey.id, expiryPresetToIso(value));
                  }}
                >
                  <option value="never">Never</option>
                  <option value="30d">30 days from now</option>
                  <option value="90d">90 days from now</option>
                  <option value="1y">1 year from now</option>
                  {apiKey.expiresAt ? (
                    <option value="custom">
                      Keep current ({formatDateTime(apiKey.expiresAt)})
                    </option>
                  ) : null}
                </select>
              </div>
            ) : null}
          </>
        )}

        {rotatedSecret ? (
          <div className="api-key-secret-banner" role="status">
            <div className="api-key-secret-banner-header">
              <strong>New secret — copy now; it will not be shown again.</strong>
              <button
                type="button"
                className="api-key-action-btn"
                onClick={() => void copySecret()}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <code className="api-secret">{rotatedSecret}</code>
            <button
              type="button"
              className="api-key-dismiss-secret"
              onClick={() => {
                setRotatedSecret(null);
                setCopied(false);
              }}
            >
              Dismiss
            </button>
          </div>
        ) : null}
      </div>

      <div className="api-key-row-actions">
        {confirmRevoke ? (
          <>
            <span className="api-key-revoke-prompt">Revoke this key?</span>
            <button
              type="button"
              className="api-key-action-btn api-key-action-btn-danger"
              disabled={revoking}
              onClick={() => void revokeKey()}
            >
              {revoking ? "Revoking…" : "Revoke"}
            </button>
            <button
              type="button"
              className="api-key-action-btn"
              disabled={revoking}
              onClick={() => setConfirmRevoke(false)}
            >
              Cancel
            </button>
          </>
        ) : confirmRotate ? (
          <>
            <span className="api-key-revoke-prompt">
              Rotate secret? The old secret stops working immediately.
            </span>
            <button
              type="button"
              className="api-key-action-btn"
              disabled={rotating}
              onClick={() => void rotateKey()}
            >
              {rotating ? "Rotating…" : "Rotate"}
            </button>
            <button
              type="button"
              className="api-key-action-btn"
              disabled={rotating}
              onClick={() => setConfirmRotate(false)}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="api-key-action-btn"
              disabled={editing || saving || !onRename}
              onClick={() => {
                setConfirmRevoke(false);
                setConfirmRotate(false);
                setEditing(true);
              }}
            >
              Rename
            </button>
            <button
              type="button"
              className="api-key-action-btn"
              disabled={editing || saving || rotating || !onRotate}
              onClick={() => {
                setEditing(false);
                setConfirmRevoke(false);
                setConfirmRotate(true);
              }}
            >
              Rotate
            </button>
            <button
              type="button"
              className="api-key-action-btn api-key-action-btn-danger"
              disabled={editing || saving || !onRevoke}
              onClick={() => {
                setEditing(false);
                setConfirmRotate(false);
                setConfirmRevoke(true);
              }}
            >
              Revoke
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function auditActionLabel(action: SettingsApiKeyAuditLogItem["action"]): string {
  switch (action) {
    case "created":
      return "Created";
    case "revoked":
      return "Revoked";
    case "rotated":
      return "Rotated";
    case "expiry_updated":
      return "Expiry updated";
  }
}

export function ApiKeysSettingsSectionView({
  apiKeys,
  auditLogs = [],
  contacts = [],
  loading = false,
  errorMessage,
  onRetry,
  onCreate,
  onRename,
  onSetContact,
  onSetExpiry,
  onRotate,
  onRevoke,
}: ApiKeysSettingsSectionViewProps) {
  const [draft, setDraft] = useState("");
  const [draftContactId, setDraftContactId] = useState<string | null>(null);
  const [draftExpiry, setDraftExpiry] = useState<ApiKeyExpiryPreset>("never");
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const contactOptions = useMemo(
    () => buildContactDropdownOptions(contacts),
    [contacts],
  );

  async function createKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = draft.trim();
    if (!name || !onCreate) return;
    setSaving(true);
    setCopied(false);
    const nextSecret = await onCreate(
      name,
      draftContactId,
      expiryPresetToIso(draftExpiry),
    );
    setSaving(false);
    if (nextSecret) {
      setSecret(nextSecret);
      setDraft("");
      setDraftContactId(null);
      setDraftExpiry("never");
    }
  }

  async function copySecret() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      // ignore
    }
  }

  return (
    <div className="settings-api-keys">
      <section className="settings-card">
        <h2>Create API key</h2>
        <p>
          Generate a bearer token for an external app or agent. Attach a contact
          so comments and activity show that person. The full secret is shown
          once when created — store it securely.
        </p>

        <form
          className="api-key-create-form"
          onSubmit={(event) => void createKey(event)}
        >
          <label className="settings-field">
            <span>Name</span>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Sander · Grok"
              autoComplete="off"
              disabled={saving || !onCreate}
            />
          </label>
          {contacts.length > 0 ? (
            <div className="settings-field">
              <span>Contact</span>
              <ApiKeyContactDropdown
                value={draftContactId}
                options={contactOptions}
                disabled={saving || !onCreate}
                ariaLabel="Contact for this API key"
                searchPlaceholder="Set contact…"
                onChange={setDraftContactId}
              />
            </div>
          ) : null}
          <label className="settings-field">
            <span>Expires</span>
            <select
              value={draftExpiry}
              disabled={saving || !onCreate}
              onChange={(event) =>
                setDraftExpiry(event.target.value as ApiKeyExpiryPreset)
              }
            >
              <option value="never">Never</option>
              <option value="30d">In 30 days</option>
              <option value="90d">In 90 days</option>
              <option value="1y">In 1 year</option>
            </select>
          </label>
          <button type="submit" disabled={!draft.trim() || saving || !onCreate}>
            {saving ? "Creating…" : "Create key"}
          </button>
        </form>

        {secret ? (
          <div className="api-key-secret-banner" role="status">
            <div className="api-key-secret-banner-header">
              <strong>Copy this key now — it will not be shown again.</strong>
              <button
                type="button"
                className="api-key-action-btn"
                onClick={() => void copySecret()}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <code className="api-secret">{secret}</code>
            <button
              type="button"
              className="api-key-dismiss-secret"
              onClick={() => {
                setSecret(null);
                setCopied(false);
              }}
            >
              Dismiss
            </button>
          </div>
        ) : null}
      </section>

      <section className="settings-card">
        <h2>API keys</h2>
        <p>
          Rename, attach a contact, set expiry, rotate, or revoke keys used by
          external clients.
        </p>

        {loading && apiKeys.length === 0 ? (
          <p className="settings-hint">Loading keys…</p>
        ) : null}

        {errorMessage ? (
          <div className="api-key-error">
            <p className="settings-hint">{errorMessage}</p>
            {onRetry ? (
              <button type="button" onClick={onRetry}>
                Retry
              </button>
            ) : null}
          </div>
        ) : null}

        {!loading && !errorMessage && apiKeys.length === 0 ? (
          <p className="settings-hint">No API keys yet.</p>
        ) : null}

        {apiKeys.length > 0 ? (
          <div className="api-key-list">
            {apiKeys.map((apiKey) => (
              <ApiKeyRow
                key={apiKey.id}
                apiKey={apiKey}
                onRename={onRename}
                onSetContact={onSetContact}
                onSetExpiry={onSetExpiry}
                onRotate={onRotate}
                onRevoke={onRevoke}
                contacts={contacts}
                contactOptions={contactOptions}
              />
            ))}
          </div>
        ) : null}
      </section>

      <section className="settings-card">
        <h2>API key audit log</h2>
        <p>Create, rotate, and revoke events for this core.</p>
        {auditLogs.length === 0 ? (
          <p className="settings-hint">No audit events yet.</p>
        ) : (
          <ul className="api-key-audit-list">
            {auditLogs.map((entry) => (
              <li key={entry.id} className="api-key-audit-row">
                <strong>{auditActionLabel(entry.action)}</strong>
                <span>{entry.apiKeyName}</span>
                <span aria-hidden="true">·</span>
                <span>{formatDateTime(entry.createdAt)}</span>
                {entry.actorKind ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{entry.actorKind}</span>
                  </>
                ) : null}
                {entry.address ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{entry.address}</span>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

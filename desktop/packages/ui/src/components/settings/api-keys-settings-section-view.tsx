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
  createdAt: string;
};

export type SettingsApiKeyContactOption = AssigneeDropdownContact;

export type ApiKeysSettingsSectionViewProps = {
  apiKeys: SettingsApiKeyItem[];
  contacts?: SettingsApiKeyContactOption[];
  loading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  onCreate?: (
    name: string,
    contactId: string | null,
  ) => Promise<string | null>;
  onRename?: (id: string, name: string) => Promise<boolean>;
  onSetContact?: (id: string, contactId: string | null) => Promise<boolean>;
  onRevoke?: (id: string) => Promise<boolean>;
};

function formatCreatedAt(value: string): string {
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
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
  onRevoke,
}: {
  apiKey: SettingsApiKeyItem;
  contacts: SettingsApiKeyContactOption[];
  contactOptions: SearchableDropdownOption<string>[];
  onRename?: (id: string, name: string) => Promise<boolean>;
  onSetContact?: (id: string, contactId: string | null) => Promise<boolean>;
  onRevoke?: (id: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(apiKey.name);
  const [saving, setSaving] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [revoking, setRevoking] = useState(false);

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

  return (
    <div className="api-key-row">
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
            <strong className="api-key-name">{apiKey.name}</strong>
            <p className="api-key-meta">
              <code>{apiKey.prefix}…</code>
              <span aria-hidden="true">·</span>
              <span>{apiKey.scopes.join(", ")}</span>
              <span aria-hidden="true">·</span>
              <span>Created {formatCreatedAt(apiKey.createdAt)}</span>
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
          </>
        )}
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
        ) : (
          <>
            <button
              type="button"
              className="api-key-action-btn"
              disabled={editing || saving || !onRename}
              onClick={() => {
                setConfirmRevoke(false);
                setEditing(true);
              }}
            >
              Rename
            </button>
            <button
              type="button"
              className="api-key-action-btn api-key-action-btn-danger"
              disabled={editing || saving || !onRevoke}
              onClick={() => {
                setEditing(false);
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

export function ApiKeysSettingsSectionView({
  apiKeys,
  contacts = [],
  loading = false,
  errorMessage,
  onRetry,
  onCreate,
  onRename,
  onSetContact,
  onRevoke,
}: ApiKeysSettingsSectionViewProps) {
  const [draft, setDraft] = useState("");
  const [draftContactId, setDraftContactId] = useState<string | null>(null);
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
    const nextSecret = await onCreate(name, draftContactId);
    setSaving(false);
    if (nextSecret) {
      setSecret(nextSecret);
      setDraft("");
      setDraftContactId(null);
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
          Rename, attach a contact, or revoke keys used by external clients.
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
                onRevoke={onRevoke}
                contacts={contacts}
                contactOptions={contactOptions}
              />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

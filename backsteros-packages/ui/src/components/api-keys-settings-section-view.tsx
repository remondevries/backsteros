"use client";

import { useEffect, useState } from "react";

export type SettingsApiKeyItem = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
};

export type ApiKeysSettingsSectionViewProps = {
  apiKeys: SettingsApiKeyItem[];
  loading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  onCreate?: (name: string) => Promise<string | null>;
  onRename?: (id: string, name: string) => Promise<boolean>;
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

function ApiKeyRow({
  apiKey,
  onRename,
  onRevoke,
}: {
  apiKey: SettingsApiKeyItem;
  onRename?: (id: string, name: string) => Promise<boolean>;
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
            </p>
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
  loading = false,
  errorMessage,
  onRetry,
  onCreate,
  onRename,
  onRevoke,
}: ApiKeysSettingsSectionViewProps) {
  const [draft, setDraft] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  async function createKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = draft.trim();
    if (!name || !onCreate) return;
    setSaving(true);
    setCopied(false);
    const nextSecret = await onCreate(name);
    setSaving(false);
    if (nextSecret) {
      setSecret(nextSecret);
      setDraft("");
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
          Generate a bearer token for external apps and agents. The full secret
          is shown once when created — store it securely.
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
              placeholder="Client portal"
              autoComplete="off"
              disabled={saving || !onCreate}
            />
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
        <p>Rename or revoke keys used by external clients.</p>

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
                onRevoke={onRevoke}
              />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

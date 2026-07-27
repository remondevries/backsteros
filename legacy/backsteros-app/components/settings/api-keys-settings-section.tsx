"use client";

import type { ApiKey, CreateApiKeyResponse } from "@backsteros/contracts";
import { CheckIcon, CopyIcon, PencilIcon, TrashIcon, XIcon } from "@primer/octicons-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { apiErrorMessage, useApiResource, useAppApi } from "@/lib/api-context";

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
  onUpdated,
  onRevoked,
}: {
  apiKey: ApiKey;
  onUpdated: (apiKey: ApiKey) => void;
  onRevoked: (id: string) => void;
}) {
  const { client } = useAppApi();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(apiKey.name);
  const [saving, setSaving] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    if (!editing) {
      setName(apiKey.name);
    }
  }, [apiKey.name, editing]);

  async function saveName() {
    const nextName = name.trim();
    if (!nextName || nextName === apiKey.name) {
      setEditing(false);
      setName(apiKey.name);
      return;
    }

    setSaving(true);
    try {
      const updated = await client.requestJson<ApiKey>(
        `/api/v1/api-keys/${encodeURIComponent(apiKey.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: nextName }),
        },
      );
      onUpdated(updated);
      setEditing(false);
      toast.success("API key renamed");
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function revokeKey() {
    setRevoking(true);
    try {
      await client.requestJson(
        `/api/v1/api-keys/${encodeURIComponent(apiKey.id)}`,
        { method: "DELETE" },
      );
      onRevoked(apiKey.id);
      toast.success("API key revoked");
    } catch (error) {
      toast.error(apiErrorMessage(error));
      setConfirmRevoke(false);
    } finally {
      setRevoking(false);
    }
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
              aria-label="Save name"
              title="Save"
            >
              <CheckIcon size={14} />
            </button>
            <button
              type="button"
              className="api-key-action-btn"
              disabled={saving}
              aria-label="Cancel rename"
              title="Cancel"
              onClick={() => {
                setEditing(false);
                setName(apiKey.name);
              }}
            >
              <XIcon size={14} />
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
              disabled={editing || saving}
              aria-label={`Rename ${apiKey.name}`}
              title="Rename"
              onClick={() => {
                setConfirmRevoke(false);
                setEditing(true);
              }}
            >
              <PencilIcon size={14} />
              <span>Rename</span>
            </button>
            <button
              type="button"
              className="api-key-action-btn api-key-action-btn-danger"
              disabled={editing || saving}
              aria-label={`Revoke ${apiKey.name}`}
              title="Revoke"
              onClick={() => {
                setEditing(false);
                setConfirmRevoke(true);
              }}
            >
              <TrashIcon size={14} />
              <span>Revoke</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function ApiKeysSettingsSection() {
  const { client } = useAppApi();
  const keys = useApiResource<{ apiKeys: ApiKey[] }>((api) =>
    api.requestJson("/api/v1/api-keys"),
  );
  const [draft, setDraft] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  async function createKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = draft.trim();
    if (!name) {
      return;
    }

    setSaving(true);
    setCopied(false);
    try {
      const result = await client.requestJson<CreateApiKeyResponse>(
        "/api/v1/api-keys",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, scopes: ["read", "write"] }),
        },
      );
      setSecret(result.secret);
      setDraft("");
      keys.setData((current) => ({
        apiKeys: [result.apiKey, ...(current?.apiKeys ?? [])],
      }));
      toast.success("API key created");
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function copySecret() {
    if (!secret) {
      return;
    }
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  const apiKeys = keys.data?.apiKeys ?? [];

  return (
    <div className="settings-api-keys">
      <section className="settings-card">
        <h2>Create API key</h2>
        <p>
          Generate a bearer token for external apps and agents. The full secret
          is shown once when created — store it securely.
        </p>

        <form className="api-key-create-form" onSubmit={(event) => void createKey(event)}>
          <label className="settings-field">
            <span>Name</span>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Client portal"
              autoComplete="off"
              disabled={saving}
            />
          </label>
          <button type="submit" disabled={!draft.trim() || saving}>
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
                {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                <span>{copied ? "Copied" : "Copy"}</span>
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

        {keys.loading && apiKeys.length === 0 ? (
          <p className="settings-hint">Loading keys…</p>
        ) : null}

        {keys.error ? (
          <div className="api-key-error">
            <p className="settings-hint">{keys.error.message}</p>
            <button type="button" onClick={() => keys.reload()}>
              Retry
            </button>
          </div>
        ) : null}

        {!keys.loading && !keys.error && apiKeys.length === 0 ? (
          <p className="settings-hint">No API keys yet.</p>
        ) : null}

        {apiKeys.length > 0 ? (
          <div className="api-key-list">
            {apiKeys.map((apiKey) => (
              <ApiKeyRow
                key={apiKey.id}
                apiKey={apiKey}
                onUpdated={(updated) => {
                  keys.setData((current) => ({
                    apiKeys: (current?.apiKeys ?? []).map((entry) =>
                      entry.id === updated.id ? updated : entry,
                    ),
                  }));
                }}
                onRevoked={(id) => {
                  keys.setData((current) => ({
                    apiKeys: (current?.apiKeys ?? []).filter(
                      (entry) => entry.id !== id,
                    ),
                  }));
                }}
              />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

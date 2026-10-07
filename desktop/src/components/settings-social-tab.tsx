import { useCallback, useEffect, useState } from "react";
import type {
  SocialSettings,
  SocialTestConnectionResult,
} from "@backsteros/contracts";
import { IntegrationConnectionSettingsView } from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";

const CONNECT_PLATFORMS: Array<{ id: string; label: string }> = [
  { id: "x", label: "X" },
  { id: "linkedin_personal", label: "LinkedIn personal" },
  { id: "linkedin_org", label: "LinkedIn page" },
  { id: "facebook_page", label: "Facebook Page" },
  { id: "instagram", label: "Instagram" },
  { id: "youtube", label: "YouTube" },
  { id: "google_business", label: "Google Business" },
  { id: "whatsapp", label: "WhatsApp" },
];

export function SettingsSocialTab({
  title,
  description,
  hideHeader = false,
}: {
  title: string;
  description: string;
  hideHeader?: boolean;
}) {
  const { client } = useDesktopApi();
  const [settings, setSettings] = useState<SocialSettings | null>(null);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const body = await client.requestJson<SocialSettings>(
        "/api/v1/settings/social",
      );
      setSettings(body);
      setSettingsError(null);
      return body;
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Could not load social settings.",
      );
      return null;
    }
  }, [client]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const patchSettings = async (patch: {
    apiKey?: string;
  }): Promise<SocialSettings | null> => {
    setSaving(true);
    setSettingsError(null);
    try {
      const body = await client.requestJson<SocialSettings>(
        "/api/v1/settings/social",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      setSettings(body);
      return body;
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Could not save social settings.",
      );
      return null;
    } finally {
      setSaving(false);
    }
  };

  const onSaveKey = async () => {
    const value = apiKeyDraft.trim();
    if (!value) return;
    const body = await patchSettings({ apiKey: value });
    if (body) setApiKeyDraft("");
  };

  const onClearKey = async () => {
    await patchSettings({ apiKey: "" });
    setApiKeyDraft("");
  };

  const onConnect = async (platform: string) => {
    setConnecting(platform);
    setSettingsError(null);
    try {
      const result = await client.requestJson<{ url: string }>(
        "/api/v1/settings/social/connect",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ platform }),
        },
      );
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Could not start account connect.",
      );
    } finally {
      setConnecting(null);
    }
  };

  const onSyncAccounts = async () => {
    setSaving(true);
    setSettingsError(null);
    try {
      const body = await client.requestJson<SocialSettings>(
        "/api/v1/settings/social/sync-accounts",
        { method: "POST" },
      );
      setSettings(body);
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Could not sync social accounts.",
      );
    } finally {
      setSaving(false);
    }
  };

  const onDisconnect = async (accountId: string) => {
    setSaving(true);
    setSettingsError(null);
    try {
      const body = await client.requestJson<SocialSettings>(
        `/api/v1/settings/social/accounts/${encodeURIComponent(accountId)}/disconnect`,
        { method: "POST" },
      );
      setSettings(body);
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Could not disconnect account.",
      );
    } finally {
      setSaving(false);
    }
  };

  const connected = settings?.connected ?? false;

  return (
    <>
      <IntegrationConnectionSettingsView
        title={title}
        headerDescription={description}
        hideHeader={hideHeader}
        connected={settings === null ? undefined : connected}
        body={
          <p>
            Paste a{" "}
            <a
              href="https://zernio.com"
              target="_blank"
              rel="noreferrer"
            >
              Zernio
            </a>{" "}
            API key. BacksterOS talks only to its own social adapter; the key
            stays in core Postgres (<code>workspace_integration_secrets</code>
            ) and is never synced to clients.
          </p>
        }
        statusLabel={
          settings === null
            ? "Loading…"
            : connected
              ? "Connected"
              : "Not connected"
        }
        secondaryLabel="API key"
        secondaryValue={
          settings?.apiKeyConfigured
            ? (settings.apiKeyPreview ?? "Configured")
            : "—"
        }
        hint={
          connected
            ? settings?.webhookConfigured
              ? "Webhook registered. Connect accounts below."
              : "Connected. Set BACKSTEROS_PUBLIC_API_URL so webhooks can register."
            : null
        }
        testing={testing}
        testMessage={testMessage}
        testOk={testOk}
        testDisabled={settings === null || !settings.apiKeyConfigured}
        onTestConnection={() => {
          void (async () => {
            setTesting(true);
            setTestMessage(null);
            setTestOk(null);
            try {
              const result =
                await client.requestJson<SocialTestConnectionResult>(
                  "/api/v1/settings/social/test",
                );
              await loadSettings();
              setTestOk(result.ok);
              setTestMessage(
                result.ok
                  ? `Connected (${result.accountCount ?? 0} accounts).`
                  : (result.error ?? "Connection test failed."),
              );
            } catch (error) {
              setTestOk(false);
              setTestMessage(
                error instanceof Error
                  ? error.message
                  : "Connection test failed.",
              );
            } finally {
              setTesting(false);
            }
          })();
        }}
      />

      <section className="settings-card">
        <h2>API key</h2>
        <label className="settings-field">
          Zernio API key
          <input
            type="password"
            autoComplete="off"
            placeholder={
              settings?.apiKeyConfigured
                ? `Configured (${settings.apiKeyPreview ?? "••••"})`
                : "Paste Zernio API key…"
            }
            value={apiKeyDraft}
            onChange={(event) => setApiKeyDraft(event.target.value)}
          />
        </label>
        <div className="settings-cursor-key-actions">
          <button
            type="button"
            disabled={saving || !apiKeyDraft.trim()}
            onClick={() => void onSaveKey()}
          >
            {saving ? "Saving…" : "Save key"}
          </button>
          <button
            type="button"
            disabled={saving || !settings?.apiKeyConfigured}
            onClick={() => void onClearKey()}
          >
            Clear key
          </button>
          <button
            type="button"
            disabled={saving || !settings?.connected}
            onClick={() => void onSyncAccounts()}
          >
            Sync accounts
          </button>
        </div>
        {settings?.profileId ? (
          <p className="settings-hint">Profile: {settings.profileId}</p>
        ) : null}
        {settingsError ? (
          <p className="settings-cursor-error">{settingsError}</p>
        ) : null}
      </section>

      <section className="settings-card">
        <h2>Connect account</h2>
        <p>
          Headless OAuth via the provider. After approving, use Sync accounts
          to refresh the list.
        </p>
        <div className="settings-cursor-key-actions">
          {CONNECT_PLATFORMS.map((platform) => (
            <button
              key={platform.id}
              type="button"
              disabled={!settings?.connected || connecting === platform.id}
              onClick={() => void onConnect(platform.id)}
            >
              {connecting === platform.id
                ? "Opening…"
                : `Connect ${platform.label}`}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-card">
        <h2>Connected accounts</h2>
        {settings?.accounts?.length ? (
          <ul className="settings-list">
            {settings.accounts.map((account) => (
              <li key={account.id}>
                <strong>{account.platform}</strong>
                {account.handle ? ` @${account.handle}` : null}
                {account.displayName ? ` — ${account.displayName}` : null}
                {account.disconnected ? " (disconnected)" : null}
                {account.needsReconnect ? " (reconnect needed)" : null}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void onDisconnect(account.id)}
                >
                  Disconnect
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="settings-hint">No accounts synced yet.</p>
        )}
      </section>
    </>
  );
}

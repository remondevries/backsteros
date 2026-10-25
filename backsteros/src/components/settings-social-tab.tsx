import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  SocialSettings,
  SocialTestConnectionResult,
} from "@backsteros/contracts";
import {
  SegmentedPillToggle,
  SettingsSecretField,
  SettingsTestConnectionSwap,
  useIntegrationSettingsHeaderTrailing,
} from "@backsteros/ui";

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

type SocialSubTab = "api-key" | "connected-account";

const SOCIAL_SUB_TABS: { value: SocialSubTab; label: string }[] = [
  { value: "api-key", label: "API key" },
  { value: "connected-account", label: "Connected account" },
];

export function SettingsSocialTab({
  title: _title,
  description: _description,
  hideHeader: _hideHeader = false,
}: {
  title: string;
  description: string;
  hideHeader?: boolean;
}) {
  const { client } = useDesktopApi();
  const [subTab, setSubTab] = useState<SocialSubTab>("api-key");
  const [settings, setSettings] = useState<SocialSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
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
  }): Promise<SocialSettings> => {
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
      const message =
        error instanceof Error
          ? error.message
          : "Could not save social settings.";
      setSettingsError(message);
      throw new Error(message, { cause: error });
    } finally {
      setSaving(false);
    }
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

  const keyConfigured = settings?.apiKeyConfigured ?? false;

  const headerTrailing = useMemo(
    () => (
      <SegmentedPillToggle
        ariaLabel="Zernio Social settings sections"
        value={subTab}
        onChange={setSubTab}
        options={SOCIAL_SUB_TABS}
      />
    ),
    [subTab],
  );
  useIntegrationSettingsHeaderTrailing(headerTrailing);

  return (
    <>
      {subTab === "api-key" ? (
        <section className="settings-card settings-card--bare">
          <h2>API key</h2>
          <p>
            Paste a{" "}
            <a href="https://zernio.com" target="_blank" rel="noreferrer">
              Zernio
            </a>{" "}
            API key. BacksterOS talks only to its own social adapter; the key
            stays in core Postgres (<code>workspace_integration_secrets</code>)
            and is never synced to clients. After connect, set{" "}
            <code>BACKSTEROS_PUBLIC_API_URL</code> so webhooks can register,
            then link accounts under Connected account.
          </p>
          <label className="settings-field">
            Zernio API key
            <SettingsSecretField
              configured={keyConfigured}
              preview={settings?.apiKeyPreview}
              emptyPlaceholder="Paste Zernio API key…"
              onSave={(value) => patchSettings({ apiKey: value })}
              trailing={
                <SettingsTestConnectionSwap
                  disabled={settings === null || !keyConfigured}
                  onTest={async () => {
                    const result =
                      await client.requestJson<SocialTestConnectionResult>(
                        "/api/v1/settings/social/test",
                      );
                    await loadSettings();
                    if (!result.ok) {
                      throw new Error(
                        result.error ?? "Connection test failed.",
                      );
                    }
                  }}
                />
              }
            />
          </label>
          {settings?.profileId ? (
            <p className="settings-hint">Profile: {settings.profileId}</p>
          ) : null}
          {settings?.connected && settings.webhookConfigured ? (
            <p className="settings-hint">Webhook registered.</p>
          ) : null}
          {settingsError ? (
            <p className="settings-cursor-error">{settingsError}</p>
          ) : null}
        </section>
      ) : null}

      {subTab === "connected-account" ? (
        <>
          <section className="settings-card settings-card--bare">
            <h2>Connect account</h2>
            <p>
              Headless OAuth via the provider. After approving, Sync accounts to
              refresh the list.
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
              <button
                type="button"
                disabled={saving || !settings?.connected}
                onClick={() => void onSyncAccounts()}
              >
                Sync accounts
              </button>
            </div>
            {settingsError ? (
              <p className="settings-cursor-error">{settingsError}</p>
            ) : null}
          </section>

          <section className="settings-card settings-card--bare">
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
      ) : null}
    </>
  );
}

import { useMemo, useState } from "react";
import type { SocialSettings } from "@backsteros/contracts";
import {
  SegmentedPillToggle,
  SettingsSecretField,
  SettingsTestConnectionSwap,
  useIntegrationSettingsHeaderTrailing,
} from "@backsteros/ui";

import { useWorkspaceIntegrationSettings } from "../lib/settings/use-workspace-integration-settings";
import type { IntegrationSettingsTabProps } from "./settings/integration-secret-settings-panel";

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
  initialSettings,
}: IntegrationSettingsTabProps<SocialSettings>) {
  const [subTab, setSubTab] = useState<SocialSubTab>("api-key");
  const [connecting, setConnecting] = useState<string | null>(null);
  const {
    client,
    settings,
    settingsError,
    setSettingsError,
    saving,
    patchSettings,
    runSettingsRequest,
    testConnection,
  } = useWorkspaceIntegrationSettings<SocialSettings, { apiKey?: string }>({
    basePath: "/api/v1/settings/social",
    label: "social",
    initialSettings,
  });

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

  const onSyncAccounts = () =>
    runSettingsRequest(
      () =>
        client.requestJson<SocialSettings>(
          "/api/v1/settings/social/sync-accounts",
          { method: "POST" },
        ),
      "Could not sync social accounts.",
    ).catch(() => undefined);

  const onDisconnect = (accountId: string) =>
    runSettingsRequest(
      () =>
        client.requestJson<SocialSettings>(
          `/api/v1/settings/social/accounts/${encodeURIComponent(accountId)}/disconnect`,
          { method: "POST" },
        ),
      "Could not disconnect account.",
    ).catch(() => undefined);

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
                    await testConnection("Connection test failed.");
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

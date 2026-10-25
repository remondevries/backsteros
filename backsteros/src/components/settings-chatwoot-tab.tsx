import { useCallback, useMemo, useState } from "react";
import type {
  ChatSyncResult,
  ChatwootSettings,
} from "@backsteros/contracts";
import {
  SegmentedPillToggle,
  SettingsSecretField,
  SettingsTestConnectionSwap,
  useIntegrationSettingsHeaderTrailing,
} from "@backsteros/ui";

import { useWorkspaceIntegrationSettings } from "../lib/settings/use-workspace-integration-settings";
import type { IntegrationSettingsTabProps } from "./settings/integration-secret-settings-panel";

type ChatwootSubTab = "connection" | "sync";

const CHATWOOT_SUB_TABS: { value: ChatwootSubTab; label: string }[] = [
  { value: "connection", label: "Connection" },
  { value: "sync", label: "Sync open conversations" },
];

export function SettingsChatwootTab({
  initialSettings,
}: IntegrationSettingsTabProps<ChatwootSettings>) {
  const [subTab, setSubTab] = useState<ChatwootSubTab>("connection");
  const [baseUrlDraft, setBaseUrlDraft] = useState("");
  const [accountIdDraft, setAccountIdDraft] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const seedDrafts = useCallback((body: ChatwootSettings) => {
    setBaseUrlDraft(body.baseUrl ?? "");
    setAccountIdDraft(body.accountId ?? "");
  }, []);
  const {
    client,
    settings,
    settingsError,
    saving,
    patchSettings,
    testConnection,
  } = useWorkspaceIntegrationSettings<
    ChatwootSettings,
    {
      baseUrl?: string;
      accountId?: string;
      apiAccessToken?: string;
      webhookSecret?: string;
    }
  >({
    basePath: "/api/v1/settings/chatwoot",
    label: "Chatwoot",
    initialSettings,
    onLoaded: seedDrafts,
  });

  const connectionDirty =
    baseUrlDraft.trim() !== (settings?.baseUrl ?? "").trim() ||
    accountIdDraft.trim() !== (settings?.accountId ?? "").trim();

  const onSaveConnection = async () => {
    await patchSettings({
      baseUrl: baseUrlDraft.trim(),
      accountId: accountIdDraft.trim(),
    });
  };

  const canTest =
    settings !== null &&
    Boolean(settings.baseUrl) &&
    Boolean(settings.accountId) &&
    Boolean(settings.apiTokenConfigured);

  const headerTrailing = useMemo(
    () => (
      <SegmentedPillToggle
        ariaLabel="Chatwoot settings sections"
        value={subTab}
        onChange={setSubTab}
        options={CHATWOOT_SUB_TABS}
      />
    ),
    [subTab],
  );
  useIntegrationSettingsHeaderTrailing(headerTrailing);

  return (
    <>
      {subTab === "connection" ? (
        <section className="settings-card settings-card--bare">
          <h2>Connection</h2>
          <p>
            Point Chatwoot at BacksterOS with the host base URL (e.g.{" "}
            <code>https://support-api.example.com</code>), numeric account id,
            and a User Access Token from Chatwoot Profile Settings. Website
            widget chats appear under Communication → Chat; replies go back
            through the Platform API.
          </p>
          <label className="settings-field">
            Base URL
            <input
              type="url"
              autoComplete="off"
              placeholder="https://support-api.example.com"
              value={baseUrlDraft}
              onChange={(event) => setBaseUrlDraft(event.target.value)}
            />
          </label>
          <label className="settings-field">
            Account id
            <input
              type="text"
              autoComplete="off"
              placeholder="1"
              value={accountIdDraft}
              onChange={(event) => setAccountIdDraft(event.target.value)}
            />
          </label>
          <div className="settings-secret-field-row__actions">
            <button
              type="button"
              disabled={saving || !connectionDirty}
              onClick={() => void onSaveConnection()}
            >
              {saving ? "Saving…" : "Save connection"}
            </button>
          </div>
          <label className="settings-field">
            User access token
            <SettingsSecretField
              configured={Boolean(settings?.apiTokenConfigured)}
              preview={settings?.apiTokenPreview}
              emptyPlaceholder="Paste User Access Token…"
              onSave={(value) =>
                patchSettings({ apiAccessToken: value })
              }
              trailing={
                <SettingsTestConnectionSwap
                  disabled={!canTest}
                  onTest={async () => {
                    await testConnection("Chatwoot connection test failed.");
                  }}
                />
              }
            />
          </label>
          <label className="settings-field">
            Webhook secret
            <SettingsSecretField
              configured={Boolean(settings?.webhookSecretConfigured)}
              emptyPlaceholder="Paste webhook signing secret…"
              onSave={(value) => patchSettings({ webhookSecret: value })}
            />
          </label>
          {settings?.webhookUrl ? (
            <p className="settings-hint">
              In Chatwoot → Settings → Integrations → Webhooks, subscribe to
              message_*, conversation_*, and conversation_typing_on/off, then
              paste <code>{settings.webhookUrl}</code>.
            </p>
          ) : (
            <p className="settings-hint">
              Set <code>BACKSTEROS_PUBLIC_API_URL</code> (HTTPS) so the webhook
              URL appears here.
            </p>
          )}
          {settingsError ? (
            <p className="settings-cursor-error">{settingsError}</p>
          ) : null}
        </section>
      ) : null}

      {subTab === "sync" ? (
        <section className="settings-card settings-card--bare">
          <h2>Sync open conversations</h2>
          <p>
            Pull recent open website conversations into Communication → Chat.
            After connect, the webhook keeps them current.
          </p>
          <div className="settings-cursor-key-actions">
            <button
              type="button"
              disabled={syncing || !settings?.connected}
              onClick={() => {
                void (async () => {
                  setSyncing(true);
                  setSyncMessage(null);
                  try {
                    const result = await client.requestJson<ChatSyncResult>(
                      "/api/v1/chat/sync",
                      {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({}),
                      },
                    );
                    setSyncMessage(
                      `Imported ${result.imported}, updated ${result.updated}.`,
                    );
                  } catch (error) {
                    setSyncMessage(
                      error instanceof Error
                        ? error.message
                        : "Chat sync failed.",
                    );
                  } finally {
                    setSyncing(false);
                  }
                })();
              }}
            >
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          </div>
          {syncMessage ? <p className="settings-hint">{syncMessage}</p> : null}
        </section>
      ) : null}
    </>
  );
}

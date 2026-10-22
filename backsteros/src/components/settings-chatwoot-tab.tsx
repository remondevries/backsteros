import { useCallback, useEffect, useState } from "react";
import type {
  ChatSyncResult,
  ChatwootSettings,
  ChatwootTestConnectionResult,
} from "@backsteros/contracts";
import { IntegrationConnectionSettingsView } from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";

export function SettingsChatwootTab({
  title,
  description,
  hideHeader = false,
}: {
  title: string;
  description: string;
  hideHeader?: boolean;
}) {
  const { client } = useDesktopApi();
  const [settings, setSettings] = useState<ChatwootSettings | null>(null);
  const [baseUrlDraft, setBaseUrlDraft] = useState("");
  const [accountIdDraft, setAccountIdDraft] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [webhookSecretDraft, setWebhookSecretDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const body = await client.requestJson<ChatwootSettings>(
        "/api/v1/settings/chatwoot",
      );
      setSettings(body);
      setBaseUrlDraft(body.baseUrl ?? "");
      setAccountIdDraft(body.accountId ?? "");
      setSettingsError(null);
      return body;
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Could not load Chatwoot settings.",
      );
      return null;
    }
  }, [client]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const patchSettings = async (patch: {
    baseUrl?: string;
    accountId?: string;
    apiAccessToken?: string;
    webhookSecret?: string;
  }): Promise<ChatwootSettings | null> => {
    setSaving(true);
    setSettingsError(null);
    try {
      const body = await client.requestJson<ChatwootSettings>(
        "/api/v1/settings/chatwoot",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      setSettings(body);
      setBaseUrlDraft(body.baseUrl ?? "");
      setAccountIdDraft(body.accountId ?? "");
      return body;
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Could not save Chatwoot settings.",
      );
      return null;
    } finally {
      setSaving(false);
    }
  };

  const onSave = async () => {
    const patch: {
      baseUrl?: string;
      accountId?: string;
      apiAccessToken?: string;
      webhookSecret?: string;
    } = {
      baseUrl: baseUrlDraft.trim(),
      accountId: accountIdDraft.trim(),
    };
    if (tokenDraft.trim()) patch.apiAccessToken = tokenDraft.trim();
    if (webhookSecretDraft.trim()) {
      patch.webhookSecret = webhookSecretDraft.trim();
    }
    const body = await patchSettings(patch);
    if (body) {
      setTokenDraft("");
      setWebhookSecretDraft("");
    }
  };

  const onClearToken = async () => {
    await patchSettings({ apiAccessToken: "" });
    setTokenDraft("");
  };

  const onClearWebhookSecret = async () => {
    await patchSettings({ webhookSecret: "" });
    setWebhookSecretDraft("");
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
            Point the Chatwoot account webhook at BacksterOS and paste a User
            Access Token from Chatwoot Profile Settings. Website widget chats
            appear under Communication → Chat; replies go back through the
            Platform API.
          </p>
        }
        statusLabel={
          settings === null
            ? "Loading…"
            : connected
              ? "Connected"
              : "Not connected"
        }
        secondaryLabel="API token"
        secondaryValue={
          settings?.apiTokenConfigured
            ? (settings.apiTokenPreview ?? "Configured")
            : "—"
        }
        hint={
          settings?.webhookUrl
            ? `Webhook URL: ${settings.webhookUrl} — subscribe to message_*, conversation_*, and conversation_typing_on/off.`
            : "Set BACKSTEROS_PUBLIC_API_URL (HTTPS) so the webhook URL appears here."
        }
        testing={testing}
        testMessage={testMessage}
        testOk={testOk}
        testDisabled={settings === null || !settings.connected}
        onTestConnection={() => {
          void (async () => {
            setTesting(true);
            setTestMessage(null);
            setTestOk(null);
            try {
              const result =
                await client.requestJson<ChatwootTestConnectionResult>(
                  "/api/v1/settings/chatwoot/test",
                );
              await loadSettings();
              setTestOk(result.ok);
              setTestMessage(
                result.ok
                  ? `Connected (${result.inboxCount ?? 0} inbox${result.inboxCount === 1 ? "" : "es"}).`
                  : (result.error ?? "Chatwoot connection test failed."),
              );
            } catch (error) {
              setTestOk(false);
              setTestMessage(
                error instanceof Error
                  ? error.message
                  : "Chatwoot connection test failed.",
              );
            } finally {
              setTesting(false);
            }
          })();
        }}
      />

      <section className="settings-card">
        <h2>Connection</h2>
        <p>
          Base URL is the Chatwoot host (e.g.{" "}
          <code>https://support-api.lemo-design.com</code>). Account id is the
          numeric account from the Chatwoot URL.
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
        <label className="settings-field">
          User access token
          <input
            type="password"
            autoComplete="off"
            placeholder={
              settings?.apiTokenConfigured
                ? `Configured (${settings.apiTokenPreview ?? "••••"})`
                : "Paste User Access Token…"
            }
            value={tokenDraft}
            onChange={(event) => setTokenDraft(event.target.value)}
          />
        </label>
        <label className="settings-field">
          Webhook secret
          <input
            type="password"
            autoComplete="off"
            placeholder={
              settings?.webhookSecretConfigured
                ? "Configured (••••)"
                : "Paste webhook signing secret…"
            }
            value={webhookSecretDraft}
            onChange={(event) => setWebhookSecretDraft(event.target.value)}
          />
        </label>
        <div className="settings-cursor-key-actions">
          <button
            type="button"
            disabled={
              saving ||
              (!baseUrlDraft.trim() &&
                !accountIdDraft.trim() &&
                !tokenDraft.trim() &&
                !webhookSecretDraft.trim())
            }
            onClick={() => void onSave()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            disabled={saving || !settings?.apiTokenConfigured}
            onClick={() => void onClearToken()}
          >
            Clear token
          </button>
          <button
            type="button"
            disabled={saving || !settings?.webhookSecretConfigured}
            onClick={() => void onClearWebhookSecret()}
          >
            Clear webhook secret
          </button>
        </div>
        {settings?.webhookUrl ? (
          <p className="settings-hint">
            In Chatwoot → Settings → Integrations → Webhooks, subscribe to
            message and conversation events and paste{" "}
            <code>{settings.webhookUrl}</code>.
          </p>
        ) : null}
        {settingsError ? (
          <p className="settings-cursor-error">{settingsError}</p>
        ) : null}
      </section>

      <section className="settings-card">
        <h2>Sync open conversations</h2>
        <p>
          Pull recent open website conversations into Communication → Chat
          (webhook keeps them current after connect).
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
    </>
  );
}

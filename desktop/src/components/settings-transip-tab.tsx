import { useCallback, useEffect, useState } from "react";
import type {
  TransipSettings,
  TransipTestConnectionResult,
} from "@backsteros/contracts";
import { IntegrationConnectionSettingsView } from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";

export function SettingsTransipTab({
  title,
  description,
  hideHeader = false,
}: {
  title: string;
  description: string;
  hideHeader?: boolean;
}) {
  const { client } = useDesktopApi();
  const [settings, setSettings] = useState<TransipSettings | null>(null);
  const [loginDraft, setLoginDraft] = useState("");
  const [privateKeyDraft, setPrivateKeyDraft] = useState("");
  const [apiTokenDraft, setApiTokenDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const body = await client.requestJson<TransipSettings>(
        "/api/v1/settings/transip",
      );
      setSettings(body);
      setSettingsError(null);
      return body;
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Could not load TransIP settings.",
      );
      return null;
    }
  }, [client]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const patchSettings = async (patch: {
    login?: string;
    privateKey?: string;
    apiToken?: string;
  }): Promise<TransipSettings | null> => {
    setSaving(true);
    setSettingsError(null);
    try {
      const body = await client.requestJson<TransipSettings>(
        "/api/v1/settings/transip",
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
          : "Could not save TransIP settings.",
      );
      return null;
    } finally {
      setSaving(false);
    }
  };

  const onSaveKeyAuth = async () => {
    const login = loginDraft.trim() || settings?.login || "";
    const privateKey = privateKeyDraft.trim();
    const patch: { login?: string; privateKey?: string } = {};
    if (loginDraft.trim() || !settings?.loginConfigured) {
      if (login) patch.login = login;
    }
    if (privateKey) patch.privateKey = privateKey;
    if (!patch.login && !patch.privateKey) return;
    if (!settings?.loginConfigured && !patch.login) return;
    if (!settings?.privateKeyConfigured && !patch.privateKey) return;
    const body = await patchSettings(patch);
    if (body) {
      setPrivateKeyDraft("");
      if (loginDraft.trim()) setLoginDraft("");
    }
  };

  const onClearKeyAuth = async () => {
    await patchSettings({ login: "", privateKey: "" });
    setLoginDraft("");
    setPrivateKeyDraft("");
  };

  const onSaveToken = async () => {
    const value = apiTokenDraft.trim();
    if (!value) return;
    const body = await patchSettings({ apiToken: value });
    if (body) setApiTokenDraft("");
  };

  const onClearToken = async () => {
    await patchSettings({ apiToken: "" });
    setApiTokenDraft("");
  };

  const connected = settings?.connected ?? false;
  const keyConfigured = settings?.keyConfigured ?? false;
  const tokenConfigured = settings?.apiTokenConfigured ?? false;
  const expiresLabel = settings?.tokenExpiresAt
    ? new Date(settings.tokenExpiresAt).toLocaleString()
    : null;

  return (
    <>
      <IntegrationConnectionSettingsView
        title={title}
        headerDescription={description}
        hideHeader={hideHeader}
        connected={settings === null ? undefined : connected}
        body={
          <p>
            Prefer{" "}
            <a
              href="https://www.transip.eu/knowledgebase/77-using-the-transip-rest-api/"
              target="_blank"
              rel="noreferrer"
            >
              login + private key
            </a>{" "}
            from the TransIP control panel. Core mints access tokens (up to 1
            month) and refreshes them before they expire — no monthly paste.
            Use a key that is <strong>not</strong> read-only so tags and WHOIS
            can be updated.
          </p>
        }
        statusLabel={
          settings === null
            ? "Loading…"
            : connected
              ? "Connected"
              : "Not connected"
        }
        testLabel={testing ? "Testing…" : "Test connection"}
        testing={testing}
        testMessage={testMessage}
        testOk={testOk}
        onTest={() => {
          void (async () => {
            setTesting(true);
            setTestMessage(null);
            setTestOk(null);
            try {
              const result =
                await client.requestJson<TransipTestConnectionResult>(
                  "/api/v1/settings/transip/test",
                );
              setTestOk(result.ok);
              setTestMessage(
                result.ok
                  ? `OK — ${result.domainCount ?? 0} domain${
                      result.domainCount === 1 ? "" : "s"
                    }`
                  : result.error ?? "TransIP connection test failed.",
              );
            } catch (error) {
              setTestOk(false);
              setTestMessage(
                error instanceof Error
                  ? error.message
                  : "TransIP connection test failed.",
              );
            } finally {
              setTesting(false);
            }
          })();
        }}
      />

      <section className="settings-card">
        <h2>Login + private key</h2>
        <p>
          Create an API key pair in TransIP → API. Store the private key here
          with your login. Core requests a JWT when needed and refreshes it
          about two days before expiry.
        </p>
        <label className="settings-field">
          TransIP login
          <input
            type="text"
            autoComplete="username"
            placeholder={
              settings?.loginConfigured
                ? `Configured (${settings.login ?? "••••"})`
                : "Your TransIP username…"
            }
            value={loginDraft}
            onChange={(event) => setLoginDraft(event.target.value)}
          />
        </label>
        <label className="settings-field">
          Private key (PEM)
          <textarea
            autoComplete="off"
            rows={6}
            spellCheck={false}
            placeholder={
              settings?.privateKeyConfigured
                ? "Configured — paste a new key to replace"
                : "-----BEGIN PRIVATE KEY-----\n…"
            }
            value={privateKeyDraft}
            onChange={(event) => setPrivateKeyDraft(event.target.value)}
          />
        </label>
        <div className="settings-cursor-key-actions">
          <button
            type="button"
            disabled={
              saving ||
              !(
                (loginDraft.trim() || settings?.loginConfigured) &&
                (privateKeyDraft.trim() || settings?.privateKeyConfigured) &&
                (loginDraft.trim() || privateKeyDraft.trim())
              )
            }
            onClick={() => void onSaveKeyAuth()}
          >
            {saving ? "Saving…" : "Save key auth"}
          </button>
          <button
            type="button"
            disabled={
              saving ||
              (!settings?.loginConfigured && !settings?.privateKeyConfigured)
            }
            onClick={() => void onClearKeyAuth()}
          >
            Clear key auth
          </button>
        </div>
        {keyConfigured ? (
          <p className="settings-hint">
            Key auth on file for {settings?.login}
            {expiresLabel ? ` · cached token expires ${expiresLabel}` : ""}.
          </p>
        ) : (
          <p className="settings-hint">
            No key auth stored
            {settings?.envKeyConfigured
              ? " (env TRANSIP_LOGIN + TRANSIP_PRIVATE_KEY is available)."
              : "."}
          </p>
        )}
      </section>

      <section className="settings-card">
        <h2>Access token (legacy)</h2>
        <p>
          Optional fallback if you paste a control-panel token. These expire
          within one month and are not auto-refreshed — prefer key auth above.
        </p>
        <label className="settings-field">
          TransIP access token
          <input
            type="password"
            autoComplete="off"
            placeholder={
              tokenConfigured
                ? `Configured (${settings?.apiTokenPreview ?? "••••"})`
                : "Paste TransIP access token…"
            }
            value={apiTokenDraft}
            onChange={(event) => setApiTokenDraft(event.target.value)}
          />
        </label>
        <div className="settings-cursor-key-actions">
          <button
            type="button"
            disabled={saving || !apiTokenDraft.trim()}
            onClick={() => void onSaveToken()}
          >
            {saving ? "Saving…" : "Save token"}
          </button>
          <button
            type="button"
            disabled={saving || !tokenConfigured}
            onClick={() => void onClearToken()}
          >
            Clear token
          </button>
        </div>
        {tokenConfigured ? (
          <p className="settings-hint">
            Token on file: {settings?.apiTokenPreview}
            {expiresLabel ? ` · expires ${expiresLabel}` : ""}
          </p>
        ) : (
          <p className="settings-hint">
            No Settings token stored
            {settings?.envTokenConfigured
              ? " (env TRANSIP_ACCESS_TOKEN is still available)."
              : "."}
          </p>
        )}
        {settingsError ? (
          <p className="settings-cursor-error">{settingsError}</p>
        ) : null}
      </section>
    </>
  );
}

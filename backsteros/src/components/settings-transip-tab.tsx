import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  TransipSettings,
  TransipTestConnectionResult,
} from "@backsteros/contracts";
import {
  SegmentedPillToggle,
  SettingsSecretField,
  SettingsTestConnectionSwap,
  useIntegrationSettingsHeaderTrailing,
} from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";
import {
  settingsSecretInputClassName,
  settingsSecretPlaceholder,
} from "../lib/settings-secret-field";

type TransipSubTab = "private-key" | "access-token";

const TRANSIP_SUB_TABS: { value: TransipSubTab; label: string }[] = [
  { value: "private-key", label: "Private key" },
  { value: "access-token", label: "Access token" },
];

export function SettingsTransipTab({
  title: _title,
  description: _description,
  hideHeader: _hideHeader = false,
}: {
  title: string;
  description: string;
  hideHeader?: boolean;
}) {
  const { client } = useDesktopApi();
  const [subTab, setSubTab] = useState<TransipSubTab>("private-key");
  const [settings, setSettings] = useState<TransipSettings | null>(null);
  const [loginDraft, setLoginDraft] = useState("");
  const [privateKeyDraft, setPrivateKeyDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
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

  const saveAccessToken = async (value: string) => {
    const body = await patchSettings({ apiToken: value });
    if (!body) {
      throw new Error(settingsError ?? "Could not save TransIP access token.");
    }
  };

  const keyConfigured = settings?.keyConfigured ?? false;
  const tokenConfigured = settings?.apiTokenConfigured ?? false;
  const expiresLabel = settings?.tokenExpiresAt
    ? new Date(settings.tokenExpiresAt).toLocaleString()
    : null;
  const canTest =
    settings !== null &&
    (keyConfigured ||
      tokenConfigured ||
      Boolean(settings.envKeyConfigured) ||
      Boolean(settings.envTokenConfigured));

  const headerTrailing = useMemo(
    () => (
      <SegmentedPillToggle
        ariaLabel="TransIP auth method"
        value={subTab}
        onChange={setSubTab}
        options={TRANSIP_SUB_TABS}
      />
    ),
    [subTab],
  );
  useIntegrationSettingsHeaderTrailing(headerTrailing);

  return (
    <>
      {subTab === "private-key" ? (
        <section className="settings-card settings-card--bare">
          <h2>Login + private key</h2>
          <p>
            Prefer{" "}
            <a
              href="https://www.transip.eu/knowledgebase/77-using-the-transip-rest-api/"
              target="_blank"
              rel="noreferrer"
            >
              login + private key
            </a>{" "}
            from the TransIP control panel (API key pair). Core mints access
            tokens (up to 1 month) and refreshes them about two days before
            expiry — no monthly paste. Use a key that is <strong>not</strong>{" "}
            read-only so tags and WHOIS can be updated.
          </p>
          <label className="settings-field">
            TransIP login
            <div className="settings-secret-field-row">
              <div className="settings-secret-field-row__control">
                <input
                  type="text"
                  autoComplete="username"
                  className={settingsSecretInputClassName(
                    Boolean(settings?.loginConfigured),
                  )}
                  placeholder={
                    settings?.loginConfigured
                      ? settingsSecretPlaceholder(settings.login)
                      : "Your TransIP username…"
                  }
                  value={loginDraft}
                  onChange={(event) => setLoginDraft(event.target.value)}
                />
                <SettingsTestConnectionSwap
                  disabled={!canTest}
                  onTest={async () => {
                    const result =
                      await client.requestJson<TransipTestConnectionResult>(
                        "/api/v1/settings/transip/test",
                      );
                    await loadSettings();
                    if (!result.ok) {
                      throw new Error(
                        result.error ?? "TransIP connection test failed.",
                      );
                    }
                  }}
                />
              </div>
              <div className="settings-secret-field-row__actions">
                <button
                  type="button"
                  disabled={
                    saving ||
                    (!settings?.loginConfigured &&
                      !settings?.privateKeyConfigured)
                  }
                  onClick={() => void onClearKeyAuth()}
                >
                  Clear key auth
                </button>
                <button
                  type="button"
                  disabled={
                    saving ||
                    !(
                      (loginDraft.trim() || settings?.loginConfigured) &&
                      (privateKeyDraft.trim() ||
                        settings?.privateKeyConfigured) &&
                      (loginDraft.trim() || privateKeyDraft.trim())
                    )
                  }
                  onClick={() => void onSaveKeyAuth()}
                >
                  {saving ? "Saving…" : "Save key auth"}
                </button>
              </div>
            </div>
          </label>
          <label className="settings-field">
            Private key (PEM)
            <textarea
              autoComplete="off"
              rows={6}
              spellCheck={false}
              className={settingsSecretInputClassName(
                Boolean(settings?.privateKeyConfigured),
              )}
              placeholder={
                settings?.privateKeyConfigured
                  ? settingsSecretPlaceholder(null)
                  : "-----BEGIN PRIVATE KEY-----\n…"
              }
              value={privateKeyDraft}
              onChange={(event) => setPrivateKeyDraft(event.target.value)}
            />
          </label>
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
          {settingsError ? (
            <p className="settings-cursor-error">{settingsError}</p>
          ) : null}
        </section>
      ) : null}

      {subTab === "access-token" ? (
        <section className="settings-card settings-card--bare">
          <h2>Access token (legacy)</h2>
          <p>
            Optional fallback if you paste a control-panel token. These expire
            within one month and are not auto-refreshed — prefer key auth
            instead.
          </p>
          <label className="settings-field">
            TransIP access token
            <SettingsSecretField
              configured={tokenConfigured}
              preview={settings?.apiTokenPreview}
              emptyPlaceholder="Paste TransIP access token…"
              onSave={saveAccessToken}
              trailing={
                <SettingsTestConnectionSwap
                  disabled={!canTest}
                  onTest={async () => {
                    const result =
                      await client.requestJson<TransipTestConnectionResult>(
                        "/api/v1/settings/transip/test",
                      );
                    await loadSettings();
                    if (!result.ok) {
                      throw new Error(
                        result.error ?? "TransIP connection test failed.",
                      );
                    }
                  }}
                />
              }
            />
          </label>
          {tokenConfigured ? (
            expiresLabel ? (
              <p className="settings-hint">
                Cached token expires {expiresLabel}.
              </p>
            ) : null
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
      ) : null}
    </>
  );
}

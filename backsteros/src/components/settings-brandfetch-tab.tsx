import { useCallback, useEffect, useState } from "react";
import type {
  BrandfetchSettings,
  BrandfetchTestConnectionResult,
} from "@backsteros/contracts";
import { IntegrationConnectionSettingsView } from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";

export function SettingsBrandfetchTab({
  title,
  description,
  hideHeader = false,
}: {
  title: string;
  description: string;
  hideHeader?: boolean;
}) {
  const { client } = useDesktopApi();
  const [settings, setSettings] = useState<BrandfetchSettings | null>(null);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const body = await client.requestJson<BrandfetchSettings>(
        "/api/v1/settings/brandfetch",
      );
      setSettings(body);
      setSettingsError(null);
      return body;
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Could not load Brandfetch settings.",
      );
      return null;
    }
  }, [client]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const patchSettings = async (patch: {
    apiKey?: string;
  }): Promise<BrandfetchSettings | null> => {
    setSaving(true);
    setSettingsError(null);
    try {
      const body = await client.requestJson<BrandfetchSettings>(
        "/api/v1/settings/brandfetch",
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
          : "Could not save Brandfetch settings.",
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
            Create a{" "}
            <a
              href="https://developers.brandfetch.com"
              target="_blank"
              rel="noreferrer"
            >
              Brandfetch Brand API key
            </a>
            . Core stores the key (not via PowerSync) and uses it to download
            organization logos into stored avatars for CardDAV and the API.
            Desktop Logo CDN hotlinks stay display-only (
            <code>VITE_BRANDFETCH_CLIENT_ID</code>).
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
            : settings?.envKeyConfigured
              ? "Env bootstrap only"
              : "—"
        }
        hint={
          settings?.envKeyConfigured && !settings.apiKeyConfigured
            ? "BRANDFETCH_API_KEY is set on the server. Save the same key here so it twin-replicates with other integration secrets."
            : connected
              ? "Missing org logos hydrate on CardDAV card GET and via the hydrate script."
              : null
        }
        testing={testing}
        testMessage={testMessage}
        testOk={testOk}
        testDisabled={
          settings === null ||
          (!settings.apiKeyConfigured && !settings.envKeyConfigured)
        }
        onTestConnection={() => {
          void (async () => {
            setTesting(true);
            setTestMessage(null);
            setTestOk(null);
            try {
              const result =
                await client.requestJson<BrandfetchTestConnectionResult>(
                  "/api/v1/settings/brandfetch/test",
                );
              await loadSettings();
              setTestOk(result.ok);
              setTestMessage(
                result.ok
                  ? "Connected to Brandfetch."
                  : (result.error ?? "Brandfetch connection test failed."),
              );
            } catch (error) {
              setTestOk(false);
              setTestMessage(
                error instanceof Error
                  ? error.message
                  : "Brandfetch connection test failed.",
              );
            } finally {
              setTesting(false);
            }
          })();
        }}
      />

      <section className="settings-card">
        <h2>Brand API key</h2>
        <p>
          Paste a Brandfetch Brand API key. Clearing the workspace key leaves
          any already-stored organization avatars in place.
        </p>
        <label className="settings-field">
          Brandfetch API key
          <input
            type="password"
            autoComplete="off"
            placeholder={
              settings?.apiKeyConfigured
                ? `Configured (${settings.apiKeyPreview ?? "••••"})`
                : "Paste Brand API key…"
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
        </div>
        {settings?.apiKeyConfigured ? (
          <p className="settings-hint">
            Key on file: {settings.apiKeyPreview}
          </p>
        ) : (
          <p className="settings-hint">
            No workspace key stored
            {settings?.envKeyConfigured
              ? " (server env fallback is active)."
              : ". Org logo hydrate stays off until you save one."}
          </p>
        )}
        {settingsError ? (
          <p className="settings-cursor-error">{settingsError}</p>
        ) : null}
      </section>
    </>
  );
}

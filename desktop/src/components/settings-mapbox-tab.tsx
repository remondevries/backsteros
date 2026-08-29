import { useCallback, useEffect, useState } from "react";
import type {
  MapboxSettings,
  MapboxTestConnectionResult,
} from "@backsteros/contracts";
import { IntegrationConnectionSettingsView } from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";

export function SettingsMapboxTab({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const { client } = useDesktopApi();
  const [settings, setSettings] = useState<MapboxSettings | null>(null);
  const [accessTokenDraft, setAccessTokenDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const body = await client.requestJson<MapboxSettings>(
        "/api/v1/settings/mapbox",
      );
      setSettings(body);
      setSettingsError(null);
      return body;
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Could not load Mapbox settings.",
      );
      return null;
    }
  }, [client]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const patchSettings = async (patch: {
    accessToken?: string;
  }): Promise<MapboxSettings | null> => {
    setSaving(true);
    setSettingsError(null);
    try {
      const body = await client.requestJson<MapboxSettings>(
        "/api/v1/settings/mapbox",
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
          : "Could not save Mapbox settings.",
      );
      return null;
    } finally {
      setSaving(false);
    }
  };

  const onSaveToken = async () => {
    const value = accessTokenDraft.trim();
    if (!value) return;
    const body = await patchSettings({ accessToken: value });
    if (body) setAccessTokenDraft("");
  };

  const onClearToken = async () => {
    await patchSettings({ accessToken: "" });
    setAccessTokenDraft("");
  };

  const connected = settings?.connected ?? false;

  return (
    <>
      <IntegrationConnectionSettingsView
        title={title}
        headerDescription={description}
        connected={settings === null ? undefined : connected}
        body={
          <p>
            Create a{" "}
            <a
              href="https://account.mapbox.com/access-tokens/"
              target="_blank"
              rel="noreferrer"
            >
              Mapbox access token
            </a>{" "}
            (public <code>pk.</code> with URL restrictions, or secret{" "}
            <code>sk.</code>). Tokens are stored in core (not synced via
            PowerSync) and used to geocode contact addresses and render maps.
          </p>
        }
        statusLabel={
          settings === null
            ? "Loading…"
            : connected
              ? "Connected"
              : "Not connected"
        }
        secondaryLabel="Token"
        secondaryValue={
          settings?.accessTokenConfigured
            ? (settings.accessTokenPreview ?? "Configured")
            : "—"
        }
        hint={
          connected
            ? "Open a contact with a street address to see the location map."
            : null
        }
        testing={testing}
        testMessage={testMessage}
        testOk={testOk}
        testDisabled={settings === null || !settings.accessTokenConfigured}
        onTestConnection={() => {
          void (async () => {
            setTesting(true);
            setTestMessage(null);
            setTestOk(null);
            try {
              const result =
                await client.requestJson<MapboxTestConnectionResult>(
                  "/api/v1/settings/mapbox/test",
                );
              await loadSettings();
              setTestOk(result.ok);
              setTestMessage(
                result.ok
                  ? "Connected to Mapbox."
                  : (result.error ?? "Mapbox connection test failed."),
              );
            } catch (error) {
              setTestOk(false);
              setTestMessage(
                error instanceof Error
                  ? error.message
                  : "Mapbox connection test failed.",
              );
            } finally {
              setTesting(false);
            }
          })();
        }}
      />

      <section className="settings-card">
        <h2>Access token</h2>
        <p>
          Paste a Mapbox token with Geocoding and Static Images access. Prefer
          scoping/restricting the token in the Mapbox account dashboard.
        </p>
        <label className="settings-field">
          Mapbox access token
          <input
            type="password"
            autoComplete="off"
            placeholder={
              settings?.accessTokenConfigured
                ? `Configured (${settings.accessTokenPreview ?? "••••"})`
                : "Paste pk. or sk. access token…"
            }
            value={accessTokenDraft}
            onChange={(event) => setAccessTokenDraft(event.target.value)}
          />
        </label>
        <div className="settings-cursor-key-actions">
          <button
            type="button"
            disabled={saving || !accessTokenDraft.trim()}
            onClick={() => void onSaveToken()}
          >
            {saving ? "Saving…" : "Save token"}
          </button>
          <button
            type="button"
            disabled={saving || !settings?.accessTokenConfigured}
            onClick={() => void onClearToken()}
          >
            Clear token
          </button>
        </div>
        {settings?.accessTokenConfigured ? (
          <p className="settings-hint">
            Token on file: {settings.accessTokenPreview}
          </p>
        ) : (
          <p className="settings-hint">
            No token stored. Contact maps stay unavailable until you save one.
          </p>
        )}
        {settingsError ? (
          <p className="settings-cursor-error">{settingsError}</p>
        ) : null}
      </section>
    </>
  );
}

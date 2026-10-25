import { useCallback, useEffect, useState } from "react";
import type {
  BrandfetchSettings,
  BrandfetchTestConnectionResult,
} from "@backsteros/contracts";
import {
  SettingsSecretField,
  SettingsTestConnectionSwap,
} from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";

export function SettingsBrandfetchTab({
  title: _title,
  description: _description,
  hideHeader: _hideHeader = false,
}: {
  title: string;
  description: string;
  hideHeader?: boolean;
}) {
  const { client } = useDesktopApi();
  const [settings, setSettings] = useState<BrandfetchSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
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
  }): Promise<BrandfetchSettings> => {
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
      const message =
        error instanceof Error
          ? error.message
          : "Could not save Brandfetch settings.";
      setSettingsError(message);
      throw new Error(message);
    }
  };

  const keyConfigured = settings?.apiKeyConfigured ?? false;
  const canTest =
    settings !== null &&
    (keyConfigured || Boolean(settings.envKeyConfigured));

  return (
    <section className="settings-card settings-card--bare">
      <h2>Brand API key</h2>
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
        organization logos into stored avatars for CardDAV and the API —
        missing org logos hydrate on CardDAV card GET and via the hydrate
        script. Replacing the workspace key leaves already-stored organization
        avatars in place. Desktop Logo CDN hotlinks stay display-only (
        <code>VITE_BRANDFETCH_CLIENT_ID</code>).
      </p>
      <label className="settings-field">
        Brandfetch API key
        <SettingsSecretField
          configured={keyConfigured}
          preview={settings?.apiKeyPreview}
          emptyPlaceholder="Paste Brand API key…"
          onSave={(value) => patchSettings({ apiKey: value })}
          trailing={
            <SettingsTestConnectionSwap
              disabled={!canTest}
              onTest={async () => {
                const result =
                  await client.requestJson<BrandfetchTestConnectionResult>(
                    "/api/v1/settings/brandfetch/test",
                  );
                await loadSettings();
                if (!result.ok) {
                  throw new Error(
                    result.error ?? "Brandfetch connection test failed.",
                  );
                }
              }}
            />
          }
        />
      </label>
      {keyConfigured ? null : (
        <p className="settings-hint">
          No workspace key stored
          {settings?.envKeyConfigured
            ? " (server env fallback is active — save the same key here so it twin-replicates)."
            : ". Org logo hydrate stays off until you save one."}
        </p>
      )}
      {settingsError ? (
        <p className="settings-cursor-error">{settingsError}</p>
      ) : null}
    </section>
  );
}
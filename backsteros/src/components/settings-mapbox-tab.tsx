import { useCallback, useEffect, useState } from "react";
import type {
  MapboxSettings,
  MapboxTestConnectionResult,
} from "@backsteros/contracts";
import {
  SettingsSecretField,
  SettingsTestConnectionSwap,
} from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";

export function SettingsMapboxTab({
  title: _title,
  description: _description,
  hideHeader: _hideHeader = false,
}: {
  title: string;
  description: string;
  hideHeader?: boolean;
}) {
  const { client } = useDesktopApi();
  const [settings, setSettings] = useState<MapboxSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
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
  }): Promise<MapboxSettings> => {
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
      const message =
        error instanceof Error
          ? error.message
          : "Could not save Mapbox settings.";
      setSettingsError(message);
      throw new Error(message, { cause: error });
    }
  };

  const tokenConfigured = settings?.accessTokenConfigured ?? false;

  return (
    <section className="settings-card settings-card--bare">
      <h2>Access token</h2>
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
        <code>sk.</code>) with Geocoding and Static Images access so contact
        addresses can geocode and maps can render. Prefer scoping/restricting
        the token in the Mapbox account dashboard. Stored in core (not via
        PowerSync).
      </p>
      <label className="settings-field">
        Mapbox access token
        <SettingsSecretField
          configured={tokenConfigured}
          preview={settings?.accessTokenPreview}
          emptyPlaceholder="Paste pk. or sk. access token…"
          onSave={(value) => patchSettings({ accessToken: value })}
          trailing={
            <SettingsTestConnectionSwap
              disabled={settings === null || !tokenConfigured}
              onTest={async () => {
                const result =
                  await client.requestJson<MapboxTestConnectionResult>(
                    "/api/v1/settings/mapbox/test",
                  );
                await loadSettings();
                if (!result.ok) {
                  throw new Error(
                    result.error ?? "Mapbox connection test failed.",
                  );
                }
              }}
            />
          }
        />
      </label>
      {tokenConfigured ? null : (
        <p className="settings-hint">
          No token stored. Contact maps stay unavailable until you save one.
        </p>
      )}
      {settingsError ? (
        <p className="settings-cursor-error">{settingsError}</p>
      ) : null}
    </section>
  );
}

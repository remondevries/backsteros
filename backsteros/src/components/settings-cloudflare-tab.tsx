import { useCallback, useEffect, useState } from "react";
import type {
  CloudflareSettings,
  CloudflareTestConnectionResult,
} from "@backsteros/contracts";
import {
  SettingsSecretField,
  SettingsTestConnectionSwap,
} from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";

export function SettingsCloudflareTab({
  title: _title,
  description: _description,
  hideHeader: _hideHeader = false,
}: {
  title: string;
  description: string;
  hideHeader?: boolean;
}) {
  const { client } = useDesktopApi();
  const [settings, setSettings] = useState<CloudflareSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const loadSettings = useCallback(async () => {
    try {
      const body = await client.requestJson<CloudflareSettings>(
        "/api/v1/settings/cloudflare",
      );
      setSettings(body);
      setSettingsError(null);
      return body;
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Could not load Cloudflare settings.",
      );
      return null;
    }
  }, [client]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const patchSettings = async (patch: {
    apiToken?: string;
  }): Promise<CloudflareSettings> => {
    setSettingsError(null);
    try {
      const body = await client.requestJson<CloudflareSettings>(
        "/api/v1/settings/cloudflare",
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
          : "Could not save Cloudflare settings.";
      setSettingsError(message);
      throw new Error(message, { cause: error });
    }
  };

  const tokenConfigured = settings?.apiTokenConfigured ?? false;
  const canTest =
    settings !== null &&
    (tokenConfigured || Boolean(settings.envTokenConfigured));

  return (
    <section className="settings-card settings-card--bare">
      <h2>API token</h2>
      <p>
        Store a Cloudflare API token with Zone read (and later DNS edit)
        permissions so Catalog Domains can match each hostname to its Cloudflare
        zone id. Stored in core (not via PowerSync); machine env /{" "}
        <code>~/.config/secrets/cloudflare.env</code> remains a fallback when no
        workspace token is saved.
      </p>
      <label className="settings-field">
        Cloudflare API token
        <SettingsSecretField
          configured={tokenConfigured}
          preview={settings?.apiTokenPreview}
          emptyPlaceholder="Paste Cloudflare API token"
          onSave={(value) => patchSettings({ apiToken: value })}
          trailing={
            <SettingsTestConnectionSwap
              disabled={!canTest}
              onTest={async () => {
                const result =
                  await client.requestJson<CloudflareTestConnectionResult>(
                    "/api/v1/settings/cloudflare/test",
                  );
                await loadSettings();
                if (!result.ok) {
                  throw new Error(
                    result.error ?? "Cloudflare connection test failed",
                  );
                }
              }}
            />
          }
        />
      </label>
      {tokenConfigured ? null : settings?.envTokenConfigured ? (
        <p className="settings-hint">
          No workspace token stored (env fallback is active).
        </p>
      ) : (
        <p className="settings-hint">No workspace token stored.</p>
      )}
      {settingsError ? (
        <p className="settings-cursor-error" role="alert">
          {settingsError}
        </p>
      ) : null}
    </section>
  );
}

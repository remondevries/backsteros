import { useCallback, useEffect, useState } from "react";
import type {
  GithubSettings,
  GithubTestConnectionResult,
} from "@backsteros/contracts";
import {
  SettingsSecretField,
  SettingsTestConnectionSwap,
} from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";

export function SettingsGithubTab({
  title: _title,
  description: _description,
  hideHeader: _hideHeader = false,
}: {
  title: string;
  description: string;
  hideHeader?: boolean;
}) {
  const { client } = useDesktopApi();
  const [settings, setSettings] = useState<GithubSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const loadSettings = useCallback(async () => {
    try {
      const body = await client.requestJson<GithubSettings>(
        "/api/v1/settings/github",
      );
      setSettings(body);
      setSettingsError(null);
      return body;
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Could not load GitHub settings.",
      );
      return null;
    }
  }, [client]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const patchSettings = async (patch: {
    apiToken?: string;
  }): Promise<GithubSettings> => {
    setSettingsError(null);
    try {
      const body = await client.requestJson<GithubSettings>(
        "/api/v1/settings/github",
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
          : "Could not save GitHub settings.";
      setSettingsError(message);
      throw new Error(message);
    }
  };

  const tokenConfigured = settings?.apiTokenConfigured ?? false;
  const canTest =
    settings !== null &&
    (tokenConfigured || Boolean(settings.envTokenConfigured));

  return (
    <section className="settings-card settings-card--bare">
      <h2>Personal access token</h2>
      <p>
        Paste a{" "}
        <a
          href="https://github.com/settings/tokens"
          target="_blank"
          rel="noreferrer"
        >
          GitHub personal access token
        </a>{" "}
        (classic or fine-grained) with <code>repo</code> access — add{" "}
        <code>read:org</code> for organization repos — so Codebase projects can
        load commits and pull requests. Prefer scoping the token to the repos
        you use in BacksterOS. Stored in core (not via PowerSync); env{" "}
        <code>GITHUB_API_TOKEN</code> remains a fallback when no Settings token
        is saved.
      </p>
      <label className="settings-field">
        GitHub API token
        <SettingsSecretField
          configured={tokenConfigured}
          preview={settings?.apiTokenPreview}
          emptyPlaceholder="Paste ghp_… or github_pat_… token…"
          saveLabel="Save"
          onSave={(value) => patchSettings({ apiToken: value })}
          trailing={
            <SettingsTestConnectionSwap
              disabled={!canTest}
              onTest={async () => {
                const result =
                  await client.requestJson<GithubTestConnectionResult>(
                    "/api/v1/settings/github/test",
                  );
                await loadSettings();
                if (!result.ok) {
                  throw new Error(
                    result.error ?? "GitHub connection test failed.",
                  );
                }
              }}
            />
          }
        />
      </label>
      {tokenConfigured ? null : (
        <p className="settings-hint">
          No Settings token stored
          {settings?.envTokenConfigured
            ? " (env GITHUB_API_TOKEN is still available)."
            : "."}
        </p>
      )}
      {settingsError ? (
        <p className="settings-cursor-error">{settingsError}</p>
      ) : null}
    </section>
  );
}

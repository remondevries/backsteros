import { useCallback, useEffect, useState } from "react";
import type {
  GithubSettings,
  GithubTestConnectionResult,
} from "@backsteros/contracts";
import { IntegrationConnectionSettingsView } from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";

export function SettingsGithubTab({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const { client } = useDesktopApi();
  const [settings, setSettings] = useState<GithubSettings | null>(null);
  const [apiTokenDraft, setApiTokenDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);

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
  }): Promise<GithubSettings | null> => {
    setSaving(true);
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
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Could not save GitHub settings.",
      );
      return null;
    } finally {
      setSaving(false);
    }
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
  const tokenConfigured = settings?.apiTokenConfigured ?? false;

  return (
    <>
      <IntegrationConnectionSettingsView
        title={title}
        headerDescription={description}
        connected={settings === null ? undefined : connected}
        body={
          <p>
            Paste a{" "}
            <a
              href="https://github.com/settings/tokens"
              target="_blank"
              rel="noreferrer"
            >
              GitHub personal access token
            </a>{" "}
            with <code>repo</code> access (and <code>read:org</code> if you use
            organization repos). Stored in core like Mapbox/Moneybird — not
            synced via PowerSync. Env <code>GITHUB_API_TOKEN</code> remains a
            fallback when no Settings token is saved.
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
          tokenConfigured
            ? (settings?.apiTokenPreview ?? "Configured")
            : settings?.envTokenConfigured
              ? "Env fallback only"
              : "—"
        }
        hint={
          tokenConfigured
            ? "Codebase projects can load commits and pull requests."
            : settings?.envTokenConfigured
              ? "Using GITHUB_API_TOKEN from the server environment until you save a Settings token."
              : null
        }
        testing={testing}
        testMessage={testMessage}
        testOk={testOk}
        testDisabled={settings === null || !connected}
        onTestConnection={() => {
          void (async () => {
            setTesting(true);
            setTestMessage(null);
            setTestOk(null);
            try {
              const result =
                await client.requestJson<GithubTestConnectionResult>(
                  "/api/v1/settings/github/test",
                );
              await loadSettings();
              setTestOk(result.ok);
              setTestMessage(
                result.ok
                  ? result.login
                    ? `Connected as ${result.login}.`
                    : "Connected to GitHub."
                  : (result.error ?? "GitHub connection test failed."),
              );
            } catch (error) {
              setTestOk(false);
              setTestMessage(
                error instanceof Error
                  ? error.message
                  : "GitHub connection test failed.",
              );
            } finally {
              setTesting(false);
            }
          })();
        }}
      />

      <section className="settings-card">
        <h2>Personal access token</h2>
        <p>
          Classic or fine-grained PAT with repository read access. Prefer
          scoping the token to the repos you use in BacksterOS.
        </p>
        <label className="settings-field">
          GitHub API token
          <input
            type="password"
            autoComplete="off"
            placeholder={
              tokenConfigured
                ? `Configured (${settings?.apiTokenPreview ?? "••••"})`
                : "Paste ghp_… or github_pat_… token…"
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
          </p>
        ) : (
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
    </>
  );
}

import type { GithubSettings } from "@backsteros/contracts";

import {
  IntegrationSecretSettingsPanel,
  type IntegrationSecretSettingsConfig,
  type IntegrationSettingsTabProps,
} from "./settings/integration-secret-settings-panel";

const GITHUB_SETTINGS: IntegrationSecretSettingsConfig<
  GithubSettings,
  "apiToken"
> = {
  basePath: "/api/v1/settings/github",
  label: "GitHub",
  patchKey: "apiToken",
  configured: (settings) => settings.apiTokenConfigured,
  preview: (settings) => settings.apiTokenPreview,
  envConfigured: (settings) => Boolean(settings.envTokenConfigured),
  heading: "Personal access token",
  intro: (
    <>
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
      load commits and pull requests. Prefer scoping the token to the repos you
      use in BacksterOS. Stored in core (not via PowerSync); env{" "}
      <code>GITHUB_API_TOKEN</code> remains a fallback when no Settings token is
      saved.
    </>
  ),
  fieldLabel: "GitHub API token",
  emptyPlaceholder: "Paste ghp_… or github_pat_… token…",
  missingHint: (envConfigured) =>
    envConfigured
      ? "No Settings token stored (env GITHUB_API_TOKEN is still available)."
      : "No Settings token stored.",
  testFailedMessage: "GitHub connection test failed.",
};

export function SettingsGithubTab({
  initialSettings,
}: IntegrationSettingsTabProps<GithubSettings>) {
  return (
    <IntegrationSecretSettingsPanel
      config={GITHUB_SETTINGS}
      initialSettings={initialSettings}
    />
  );
}

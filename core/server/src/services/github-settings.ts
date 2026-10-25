import type {
  GithubSettings,
  GithubTestConnectionResult,
} from "@backsteros/contracts";

import { previewCursorApiKey } from "./cursor-settings.js";
import { getConfiguredGithubApiToken } from "./github-auth.js";
import { createIntegrationSecretSettingsService } from "./integration-secret-settings.js";
import { workspaceIntegrationSecretStore } from "./integration-secret-store.js";

export function previewGithubApiToken(token: string): string {
  return previewCursorApiKey(token);
}

const githubSettings = createIntegrationSecretSettingsService({
  store: workspaceIntegrationSecretStore("githubApiToken"),
  patchKey: "apiToken",
  preview: previewGithubApiToken,
  envFallback: getConfiguredGithubApiToken,
  toSettings: (state): GithubSettings => ({
    apiTokenConfigured: state.configured,
    apiTokenPreview: state.preview,
    connected: state.connected,
    envTokenConfigured: state.envConfigured,
  }),
  test: testGithubApiToken,
});

/** Workspace-stored PAT (Settings → GitHub). */
export const getWorkspaceGithubApiToken = githubSettings.getWorkspaceSecret;

/** Workspace PAT, then `GITHUB_API_TOKEN` env fallback. */
export const getWorkspaceOrEnvGithubToken = githubSettings.getSecret;

export const getGithubSettings = githubSettings.getSettings;

export const updateGithubSettings = githubSettings.updateSettings;

export const testGithubConnection = githubSettings.testConnection;

async function testGithubApiToken(
  token: string | null,
): Promise<GithubTestConnectionResult> {
  if (!token) {
    return {
      ok: false,
      error:
        "GitHub API token is not configured. Paste a PAT in Settings → GitHub.",
      login: null,
    };
  }

  try {
    const { getGithubConnectionStatus } = await import("./github.js");
    const status = await getGithubConnectionStatus(token);
    if (!status.connected) {
      return {
        ok: false,
        error: status.reason ?? "GitHub connection test failed.",
        login: status.login,
      };
    }
    return {
      ok: true,
      error: null,
      login: status.login,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "GitHub connection test failed.",
      login: null,
    };
  }
}

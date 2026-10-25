import type {
  BrandfetchSettings,
  BrandfetchTestConnectionResult,
} from "@backsteros/contracts";

import {
  brandfetchApiKeyFromEnv,
  previewBrandfetchApiKey,
} from "./brandfetch-env.js";
import { createIntegrationSecretSettingsService } from "./integration-secret-settings.js";
import { workspaceIntegrationSecretStore } from "./integration-secret-store.js";

export { brandfetchApiKeyFromEnv, previewBrandfetchApiKey };

const brandfetchSettings = createIntegrationSecretSettingsService({
  store: workspaceIntegrationSecretStore("brandfetchApiKey"),
  patchKey: "apiKey",
  preview: previewBrandfetchApiKey,
  envFallback: brandfetchApiKeyFromEnv,
  toSettings: (state): BrandfetchSettings => ({
    apiKeyConfigured: state.configured,
    apiKeyPreview: state.preview,
    connected: state.connected,
    envKeyConfigured: state.envConfigured,
  }),
  test: testBrandfetchApiKey,
});

/** Workspace-stored Brand API key (Settings → Brandfetch). */
export const getWorkspaceBrandfetchApiKey =
  brandfetchSettings.getWorkspaceSecret;

/** Workspace key, then `BRANDFETCH_API_KEY` env fallback (GitHub pattern). */
export const getBrandfetchApiKey = brandfetchSettings.getSecret;

export const getBrandfetchSettings = brandfetchSettings.getSettings;

export const updateBrandfetchSettings = brandfetchSettings.updateSettings;

export const testBrandfetchConnection = brandfetchSettings.testConnection;

async function testBrandfetchApiKey(
  apiKey: string | null,
): Promise<BrandfetchTestConnectionResult> {
  if (!apiKey) {
    return {
      ok: false,
      error:
        "Brandfetch API key is not configured. Paste a Brand API key in Settings → Brandfetch.",
    };
  }

  try {
    const res = await fetch("https://api.brandfetch.io/v2/brands/brandfetch.com", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error: `Brandfetch rejected the API key (HTTP ${res.status}).`,
      };
    }
    if (res.status === 429) {
      return {
        ok: false,
        error: "Brandfetch rate limit hit — try again in a minute.",
      };
    }
    if (!res.ok && res.status !== 404) {
      return {
        ok: false,
        error: `Brandfetch Brand API returned HTTP ${res.status}.`,
      };
    }
    return { ok: true, error: null };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Brandfetch connection test failed.",
    };
  }
}

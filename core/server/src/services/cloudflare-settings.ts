import type {
  CloudflareSettings,
  CloudflareStatus,
  CloudflareTestConnectionResult,
} from "@backsteros/contracts";

import {
  CloudflareApiError,
  CloudflareClient,
} from "../lib/cloudflare-client.js";
import { previewCursorApiKey } from "./cursor-settings.js";
import { getConfiguredCloudflareApiToken } from "./cloudflare-auth.js";
import { createIntegrationSecretSettingsService } from "./integration-secret-settings.js";
import { workspaceIntegrationSecretStore } from "./integration-secret-store.js";

export function previewCloudflareApiToken(token: string): string {
  return previewCursorApiKey(token);
}

const cloudflareSettings = createIntegrationSecretSettingsService({
  store: workspaceIntegrationSecretStore("cloudflareApiToken"),
  patchKey: "apiToken",
  preview: previewCloudflareApiToken,
  envFallback: getConfiguredCloudflareApiToken,
  toSettings: (state): CloudflareSettings => ({
    apiTokenConfigured: state.configured,
    apiTokenPreview: state.preview,
    connected: state.connected,
    envTokenConfigured: state.envConfigured,
  }),
  test: testCloudflareApiToken,
});

/** Workspace-stored token (Settings → Cloudflare). */
export const getWorkspaceCloudflareApiToken =
  cloudflareSettings.getWorkspaceSecret;

/** Workspace token, then `CLOUDFLARE_API_TOKEN` / secrets file fallback. */
export const getWorkspaceOrEnvCloudflareToken = cloudflareSettings.getSecret;

export const getCloudflareSettings = cloudflareSettings.getSettings;

export async function getCloudflareStatus(
  workspaceId: string,
): Promise<CloudflareStatus> {
  const settings = await getCloudflareSettings(workspaceId);
  return { configured: settings.connected };
}

export const updateCloudflareSettings = cloudflareSettings.updateSettings;

export const testCloudflareConnection = cloudflareSettings.testConnection;

async function testCloudflareApiToken(
  token: string | null,
): Promise<CloudflareTestConnectionResult> {
  if (!token) {
    return {
      ok: false,
      error:
        "Cloudflare API token is not configured. Paste a token in Settings → Integrations → Cloudflare.",
      zoneCount: null,
    };
  }

  try {
    const client = new CloudflareClient({ apiToken: token });
    const zones = await client.listZones();
    return {
      ok: true,
      error: null,
      zoneCount: zones.length,
    };
  } catch (error) {
    if (error instanceof CloudflareApiError) {
      return {
        ok: false,
        error: error.message,
        zoneCount: null,
      };
    }
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Cloudflare connection test failed",
      zoneCount: null,
    };
  }
}

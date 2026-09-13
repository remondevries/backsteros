import { eq } from "drizzle-orm";

import type {
  CloudflareSettings,
  CloudflareStatus,
  CloudflareTestConnectionResult,
  UpdateCloudflareSettingsInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import { workspaceIntegrationSecrets } from "../db/schema.js";
import {
  CloudflareApiError,
  CloudflareClient,
} from "../lib/cloudflare-client.js";
import { previewCursorApiKey } from "./cursor-settings.js";
import { getConfiguredCloudflareApiToken } from "./cloudflare-auth.js";

export function previewCloudflareApiToken(token: string): string {
  return previewCursorApiKey(token);
}

async function getSecretRow(
  workspaceId: string,
): Promise<{ cloudflareApiToken: string | null } | null> {
  const [row] = await db
    .select({
      cloudflareApiToken: workspaceIntegrationSecrets.cloudflareApiToken,
    })
    .from(workspaceIntegrationSecrets)
    .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId))
    .limit(1);
  return row ?? null;
}

/** Workspace-stored token (Settings → Cloudflare). */
export async function getWorkspaceCloudflareApiToken(
  workspaceId: string,
): Promise<string | null> {
  const row = await getSecretRow(workspaceId);
  const token = row?.cloudflareApiToken?.trim();
  return token || null;
}

/** Workspace token, then `CLOUDFLARE_API_TOKEN` / secrets file fallback. */
export async function getWorkspaceOrEnvCloudflareToken(
  workspaceId: string,
): Promise<string | null> {
  const fromWorkspace = await getWorkspaceCloudflareApiToken(workspaceId);
  if (fromWorkspace) return fromWorkspace;
  return getConfiguredCloudflareApiToken();
}

export async function getCloudflareSettings(
  workspaceId: string,
): Promise<CloudflareSettings> {
  const apiToken = await getWorkspaceCloudflareApiToken(workspaceId);
  const envTokenConfigured = getConfiguredCloudflareApiToken() != null;
  return {
    apiTokenConfigured: Boolean(apiToken),
    apiTokenPreview: apiToken ? previewCloudflareApiToken(apiToken) : null,
    connected: Boolean(apiToken) || envTokenConfigured,
    envTokenConfigured,
  };
}

export async function getCloudflareStatus(
  workspaceId: string,
): Promise<CloudflareStatus> {
  const settings = await getCloudflareSettings(workspaceId);
  return { configured: settings.connected };
}

export async function updateCloudflareSettings(
  workspaceId: string,
  patch: UpdateCloudflareSettingsInput,
): Promise<CloudflareSettings> {
  const current = await getWorkspaceCloudflareApiToken(workspaceId);
  let nextToken = current;

  if (patch.apiToken !== undefined) {
    const trimmed = patch.apiToken.trim();
    nextToken = trimmed.length > 0 ? trimmed : null;
  }

  await db
    .insert(workspaceIntegrationSecrets)
    .values({
      workspaceId,
      cloudflareApiToken: nextToken,
    })
    .onConflictDoUpdate({
      target: workspaceIntegrationSecrets.workspaceId,
      set: {
        cloudflareApiToken: nextToken,
        updatedAt: new Date(),
      },
    });

  return getCloudflareSettings(workspaceId);
}

export async function testCloudflareConnection(
  workspaceId: string,
): Promise<CloudflareTestConnectionResult> {
  const token = await getWorkspaceOrEnvCloudflareToken(workspaceId);
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

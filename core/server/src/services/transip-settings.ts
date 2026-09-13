import { eq } from "drizzle-orm";

import type {
  TransipSettings,
  TransipStatus,
  TransipTestConnectionResult,
  UpdateTransipSettingsInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import { workspaceIntegrationSecrets } from "../db/schema.js";
import {
  TransipApiError,
  TransipClient,
} from "../lib/transip-client.js";
import { previewCursorApiKey } from "./cursor-settings.js";
import { getConfiguredTransipAccessToken } from "./transip-auth.js";

export function previewTransipAccessToken(token: string): string {
  return previewCursorApiKey(token);
}

async function getSecretRow(
  workspaceId: string,
): Promise<{ transipAccessToken: string | null } | null> {
  const [row] = await db
    .select({
      transipAccessToken: workspaceIntegrationSecrets.transipAccessToken,
    })
    .from(workspaceIntegrationSecrets)
    .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId))
    .limit(1);
  return row ?? null;
}

/** Workspace-stored token (Settings → TransIP). */
export async function getWorkspaceTransipAccessToken(
  workspaceId: string,
): Promise<string | null> {
  const row = await getSecretRow(workspaceId);
  const token = row?.transipAccessToken?.trim();
  return token || null;
}

/** Workspace token, then `TRANSIP_ACCESS_TOKEN` / secrets file fallback. */
export async function getWorkspaceOrEnvTransipToken(
  workspaceId: string,
): Promise<string | null> {
  const fromWorkspace = await getWorkspaceTransipAccessToken(workspaceId);
  if (fromWorkspace) return fromWorkspace;
  return getConfiguredTransipAccessToken();
}

export async function getTransipSettings(
  workspaceId: string,
): Promise<TransipSettings> {
  const apiToken = await getWorkspaceTransipAccessToken(workspaceId);
  const envTokenConfigured = getConfiguredTransipAccessToken() != null;
  return {
    apiTokenConfigured: Boolean(apiToken),
    apiTokenPreview: apiToken ? previewTransipAccessToken(apiToken) : null,
    connected: Boolean(apiToken) || envTokenConfigured,
    envTokenConfigured,
  };
}

export async function getTransipStatus(
  workspaceId: string,
): Promise<TransipStatus> {
  const settings = await getTransipSettings(workspaceId);
  return { configured: settings.connected };
}

export async function updateTransipSettings(
  workspaceId: string,
  patch: UpdateTransipSettingsInput,
): Promise<TransipSettings> {
  const current = await getWorkspaceTransipAccessToken(workspaceId);
  let nextToken = current;

  if (patch.apiToken !== undefined) {
    const trimmed = patch.apiToken.trim();
    nextToken = trimmed.length > 0 ? trimmed : null;
  }

  await db
    .insert(workspaceIntegrationSecrets)
    .values({
      workspaceId,
      transipAccessToken: nextToken,
    })
    .onConflictDoUpdate({
      target: workspaceIntegrationSecrets.workspaceId,
      set: {
        transipAccessToken: nextToken,
        updatedAt: new Date(),
      },
    });

  return getTransipSettings(workspaceId);
}

export async function testTransipConnection(
  workspaceId: string,
): Promise<TransipTestConnectionResult> {
  const token = await getWorkspaceOrEnvTransipToken(workspaceId);
  if (!token) {
    return {
      ok: false,
      error:
        "TransIP access token is not configured. Paste a token in Settings → TransIP.",
      domainCount: null,
    };
  }

  try {
    const client = new TransipClient({ accessToken: token });
    const domains = await client.listDomains();
    return {
      ok: true,
      error: null,
      domainCount: domains.length,
    };
  } catch (error) {
    const message =
      error instanceof TransipApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "TransIP connection test failed.";
    return {
      ok: false,
      error: message,
      domainCount: null,
    };
  }
}

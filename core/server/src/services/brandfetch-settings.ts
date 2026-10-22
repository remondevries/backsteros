import { eq } from "drizzle-orm";

import type {
  BrandfetchSettings,
  BrandfetchTestConnectionResult,
  UpdateBrandfetchSettingsInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import { workspaceIntegrationSecrets } from "../db/schema.js";
import {
  brandfetchApiKeyFromEnv,
  previewBrandfetchApiKey,
} from "./brandfetch-env.js";

export { brandfetchApiKeyFromEnv, previewBrandfetchApiKey };

async function getSecretRow(
  workspaceId: string,
): Promise<{ brandfetchApiKey: string | null } | null> {
  const [row] = await db
    .select({
      brandfetchApiKey: workspaceIntegrationSecrets.brandfetchApiKey,
    })
    .from(workspaceIntegrationSecrets)
    .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId))
    .limit(1);
  return row ?? null;
}

/** Workspace-stored Brand API key (Settings → Brandfetch). */
export async function getWorkspaceBrandfetchApiKey(
  workspaceId: string,
): Promise<string | null> {
  const row = await getSecretRow(workspaceId);
  const key = row?.brandfetchApiKey?.trim();
  return key || null;
}

/** Workspace key, then `BRANDFETCH_API_KEY` env fallback (GitHub pattern). */
export async function getBrandfetchApiKey(
  workspaceId: string,
): Promise<string | null> {
  const fromWorkspace = await getWorkspaceBrandfetchApiKey(workspaceId);
  if (fromWorkspace) return fromWorkspace;
  return brandfetchApiKeyFromEnv();
}

export async function getBrandfetchSettings(
  workspaceId: string,
): Promise<BrandfetchSettings> {
  const apiKey = await getWorkspaceBrandfetchApiKey(workspaceId);
  const envKeyConfigured = brandfetchApiKeyFromEnv() != null;
  return {
    apiKeyConfigured: Boolean(apiKey),
    apiKeyPreview: apiKey ? previewBrandfetchApiKey(apiKey) : null,
    connected: Boolean(apiKey) || envKeyConfigured,
    envKeyConfigured,
  };
}

export async function updateBrandfetchSettings(
  workspaceId: string,
  patch: UpdateBrandfetchSettingsInput,
): Promise<BrandfetchSettings> {
  const current = await getWorkspaceBrandfetchApiKey(workspaceId);
  let nextKey = current;

  if (patch.apiKey !== undefined) {
    const trimmed = patch.apiKey.trim();
    nextKey = trimmed.length > 0 ? trimmed : null;
  }

  await db
    .insert(workspaceIntegrationSecrets)
    .values({
      workspaceId,
      brandfetchApiKey: nextKey,
    })
    .onConflictDoUpdate({
      target: workspaceIntegrationSecrets.workspaceId,
      set: {
        brandfetchApiKey: nextKey,
        updatedAt: new Date(),
      },
    });

  return getBrandfetchSettings(workspaceId);
}

export async function testBrandfetchConnection(
  workspaceId: string,
): Promise<BrandfetchTestConnectionResult> {
  const apiKey = await getBrandfetchApiKey(workspaceId);
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

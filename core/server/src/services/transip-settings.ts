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
  createTransipAccessToken,
  isTransipAccessTokenFresh,
  readJwtExpiryMs,
} from "../lib/transip-access-token.js";
import {
  TransipApiError,
  TransipClient,
} from "../lib/transip-client.js";
import { previewCursorApiKey } from "./cursor-settings.js";
import {
  getConfiguredTransipAccessToken,
  getConfiguredTransipKeyCredentials,
} from "./transip-auth.js";

export function previewTransipAccessToken(token: string): string {
  return previewCursorApiKey(token);
}

type SecretRow = {
  transipAccessToken: string | null;
  transipLogin: string | null;
  transipPrivateKey: string | null;
  transipAccessTokenExpiresAt: Date | null;
};

async function getSecretRow(workspaceId: string): Promise<SecretRow | null> {
  const [row] = await db
    .select({
      transipAccessToken: workspaceIntegrationSecrets.transipAccessToken,
      transipLogin: workspaceIntegrationSecrets.transipLogin,
      transipPrivateKey: workspaceIntegrationSecrets.transipPrivateKey,
      transipAccessTokenExpiresAt:
        workspaceIntegrationSecrets.transipAccessTokenExpiresAt,
    })
    .from(workspaceIntegrationSecrets)
    .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId))
    .limit(1);
  return row ?? null;
}

async function persistCachedAccessToken(
  workspaceId: string,
  token: string,
  expiresAt: Date | null,
): Promise<void> {
  await db
    .insert(workspaceIntegrationSecrets)
    .values({
      workspaceId,
      transipAccessToken: token,
      transipAccessTokenExpiresAt: expiresAt,
    })
    .onConflictDoUpdate({
      target: workspaceIntegrationSecrets.workspaceId,
      set: {
        transipAccessToken: token,
        transipAccessTokenExpiresAt: expiresAt,
        updatedAt: new Date(),
      },
    });
}

async function mintAndCacheAccessToken(
  workspaceId: string,
  login: string,
  privateKey: string,
): Promise<string> {
  const minted = await createTransipAccessToken({
    login,
    privateKey,
    readOnly: false,
    globalKey: true,
    expirationTime: "1 month",
    label: `backsteros-${workspaceId.slice(0, 8)}`,
  });
  const expiresAt =
    minted.expiresAt ??
    (readJwtExpiryMs(minted.token) != null
      ? new Date(readJwtExpiryMs(minted.token)!)
      : null);
  await persistCachedAccessToken(workspaceId, minted.token, expiresAt);
  return minted.token;
}

/** Workspace login + private key for automatic JWT minting. */
export async function getWorkspaceTransipKeyCredentials(
  workspaceId: string,
): Promise<{ login: string; privateKey: string } | null> {
  const row = await getSecretRow(workspaceId);
  const login = row?.transipLogin?.trim() || "";
  const privateKey = row?.transipPrivateKey?.trim() || "";
  if (!login || !privateKey) return null;
  return { login, privateKey };
}

/** Cached / manually pasted workspace token (may be stale). */
export async function getWorkspaceTransipAccessToken(
  workspaceId: string,
): Promise<string | null> {
  const row = await getSecretRow(workspaceId);
  const token = row?.transipAccessToken?.trim();
  return token || null;
}

/**
 * Resolve a usable TransIP JWT:
 * 1. Workspace login+key → mint/refresh cached token when near expiry
 * 2. Env login+key → mint (not persisted)
 * 3. Fresh workspace cached/manual token
 * 4. Env `TRANSIP_ACCESS_TOKEN`
 */
export async function getWorkspaceOrEnvTransipToken(
  workspaceId: string,
): Promise<string | null> {
  const row = await getSecretRow(workspaceId);
  const workspaceKeys = await getWorkspaceTransipKeyCredentials(workspaceId);
  if (workspaceKeys) {
    const cached = row?.transipAccessToken?.trim() || "";
    if (
      cached &&
      isTransipAccessTokenFresh(
        row?.transipAccessTokenExpiresAt ?? readJwtExpiryMs(cached),
      )
    ) {
      return cached;
    }
    return mintAndCacheAccessToken(
      workspaceId,
      workspaceKeys.login,
      workspaceKeys.privateKey,
    );
  }

  const envKeys = getConfiguredTransipKeyCredentials();
  if (envKeys) {
    const minted = await createTransipAccessToken({
      login: envKeys.login,
      privateKey: envKeys.privateKey,
      readOnly: false,
      globalKey: true,
      expirationTime: "1 month",
      label: "backsteros-env",
    });
    return minted.token;
  }

  const fromWorkspace = row?.transipAccessToken?.trim() || "";
  if (fromWorkspace) return fromWorkspace;

  return getConfiguredTransipAccessToken();
}

export async function getTransipSettings(
  workspaceId: string,
): Promise<TransipSettings> {
  const row = await getSecretRow(workspaceId);
  const login = row?.transipLogin?.trim() || "";
  const privateKeyConfigured = Boolean(row?.transipPrivateKey?.trim());
  const apiToken = row?.transipAccessToken?.trim() || "";
  const envTokenConfigured = getConfiguredTransipAccessToken() != null;
  const envKeyConfigured = getConfiguredTransipKeyCredentials() != null;
  const keyConfigured = Boolean(login) && privateKeyConfigured;
  const expiresAt = row?.transipAccessTokenExpiresAt ?? null;
  return {
    login: login || null,
    loginConfigured: Boolean(login),
    privateKeyConfigured,
    keyConfigured,
    apiTokenConfigured: Boolean(apiToken),
    apiTokenPreview: apiToken ? previewTransipAccessToken(apiToken) : null,
    tokenExpiresAt: expiresAt ? expiresAt.toISOString() : null,
    connected: keyConfigured || Boolean(apiToken) || envTokenConfigured || envKeyConfigured,
    envTokenConfigured,
    envKeyConfigured,
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
  const current = await getSecretRow(workspaceId);
  let nextToken = current?.transipAccessToken ?? null;
  let nextExpiresAt = current?.transipAccessTokenExpiresAt ?? null;
  let nextLogin = current?.transipLogin ?? null;
  let nextPrivateKey = current?.transipPrivateKey ?? null;
  let credentialsChanged = false;

  if (patch.login !== undefined) {
    const trimmed = patch.login.trim();
    nextLogin = trimmed.length > 0 ? trimmed : null;
    credentialsChanged = true;
  }
  if (patch.privateKey !== undefined) {
    const trimmed = patch.privateKey.trim();
    nextPrivateKey = trimmed.length > 0 ? trimmed : null;
    credentialsChanged = true;
  }
  if (patch.apiToken !== undefined) {
    const trimmed = patch.apiToken.trim();
    nextToken = trimmed.length > 0 ? trimmed : null;
    nextExpiresAt =
      nextToken != null
        ? (() => {
            const ms = readJwtExpiryMs(nextToken);
            return ms != null ? new Date(ms) : null;
          })()
        : null;
  }

  if (credentialsChanged) {
    // Force remint on next use after login/key changes.
    nextToken = null;
    nextExpiresAt = null;
  }

  await db
    .insert(workspaceIntegrationSecrets)
    .values({
      workspaceId,
      transipAccessToken: nextToken,
      transipAccessTokenExpiresAt: nextExpiresAt,
      transipLogin: nextLogin,
      transipPrivateKey: nextPrivateKey,
    })
    .onConflictDoUpdate({
      target: workspaceIntegrationSecrets.workspaceId,
      set: {
        transipAccessToken: nextToken,
        transipAccessTokenExpiresAt: nextExpiresAt,
        transipLogin: nextLogin,
        transipPrivateKey: nextPrivateKey,
        updatedAt: new Date(),
      },
    });

  // Eager-mint so Test connection / sync works immediately after save.
  if (nextLogin && nextPrivateKey) {
    try {
      await mintAndCacheAccessToken(workspaceId, nextLogin, nextPrivateKey);
    } catch {
      // Settings still save; test connection surfaces the mint error.
    }
  }

  return getTransipSettings(workspaceId);
}

export async function testTransipConnection(
  workspaceId: string,
): Promise<TransipTestConnectionResult> {
  try {
    const token = await getWorkspaceOrEnvTransipToken(workspaceId);
    if (!token) {
      return {
        ok: false,
        error:
          "TransIP is not configured. Add your login + private key in Settings → TransIP (or set TRANSIP_ACCESS_TOKEN).",
        domainCount: null,
      };
    }
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

import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import type {
  SocialSettings,
  SocialTestConnectionResult,
  UpdateSocialSettingsInput,
} from "@backsteros/contracts";

import { db } from "../../../db/index.js";
import {
  socialAccounts,
  workspaceIntegrationSecrets,
} from "../../../db/schema.js";
import { newId } from "../../../lib/crypto.js";
import { previewCursorApiKey } from "../../../services/cursor-settings.js";
import { ZernioOwnedAccountAdapter } from "./adapter.js";
import { ZernioApiError, ZernioClient } from "./client.js";
import { setZernioAccountCount } from "./request-gate.js";

const WEBHOOK_EVENTS = [
  "comment.received",
  "message.received",
  "message.sent",
  "message.delivered",
  "message.read",
  "message.failed",
  "conversation.started",
  "post.scheduled",
  "post.published",
  "post.failed",
  "post.partial",
  "account.disconnected",
  "analytics.synced",
] as const;

export function previewZernioApiKey(apiKey: string): string {
  return previewCursorApiKey(apiKey);
}

type SecretRow = {
  zernioApiKey: string | null;
  zernioProfileId: string | null;
  zernioWebhookId: string | null;
  zernioWebhookSecret: string | null;
  zernioWebhookUrl: string | null;
  zernioAnalyticsCursor: string | null;
};

async function getSecretRow(workspaceId: string): Promise<SecretRow | null> {
  const [row] = await db
    .select({
      zernioApiKey: workspaceIntegrationSecrets.zernioApiKey,
      zernioProfileId: workspaceIntegrationSecrets.zernioProfileId,
      zernioWebhookId: workspaceIntegrationSecrets.zernioWebhookId,
      zernioWebhookSecret: workspaceIntegrationSecrets.zernioWebhookSecret,
      zernioWebhookUrl: workspaceIntegrationSecrets.zernioWebhookUrl,
      zernioAnalyticsCursor: workspaceIntegrationSecrets.zernioAnalyticsCursor,
    })
    .from(workspaceIntegrationSecrets)
    .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId))
    .limit(1);
  return row ?? null;
}

export async function getZernioCredentials(workspaceId: string): Promise<{
  apiKey: string | null;
  profileId: string | null;
  webhookSecret: string | null;
  webhookId: string | null;
  webhookUrl: string | null;
  analyticsCursor: string | null;
}> {
  const row = await getSecretRow(workspaceId);
  return {
    apiKey: row?.zernioApiKey?.trim() || null,
    profileId: row?.zernioProfileId?.trim() || null,
    webhookSecret: row?.zernioWebhookSecret?.trim() || null,
    webhookId: row?.zernioWebhookId?.trim() || null,
    webhookUrl: row?.zernioWebhookUrl?.trim() || null,
    analyticsCursor: row?.zernioAnalyticsCursor?.trim() || null,
  };
}

export async function createZernioAdapter(
  workspaceId: string,
): Promise<ZernioOwnedAccountAdapter | null> {
  const creds = await getZernioCredentials(workspaceId);
  if (!creds.apiKey) return null;
  return new ZernioOwnedAccountAdapter({
    workspaceId,
    apiKey: creds.apiKey,
    profileId: creds.profileId,
    webhookSecret: creds.webhookSecret,
  });
}

export async function getSocialSettings(
  workspaceId: string,
): Promise<SocialSettings> {
  const creds = await getZernioCredentials(workspaceId);
  const accountRows = await db
    .select({
      id: socialAccounts.id,
      platform: socialAccounts.platform,
      handle: socialAccounts.handle,
      displayName: socialAccounts.displayName,
      disconnected: socialAccounts.disconnected,
      needsReconnect: socialAccounts.needsReconnect,
      capabilities: socialAccounts.capabilities,
    })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.workspaceId, workspaceId),
        eq(socialAccounts.provider, "zernio"),
        isNull(socialAccounts.deletedAt),
      ),
    );

  return {
    apiKeyConfigured: Boolean(creds.apiKey),
    apiKeyPreview: creds.apiKey ? previewZernioApiKey(creds.apiKey) : null,
    profileId: creds.profileId,
    webhookConfigured: Boolean(creds.webhookId && creds.webhookSecret),
    connected: Boolean(creds.apiKey && creds.profileId),
    analyticsCursor: creds.analyticsCursor,
    accounts: accountRows.map((row) => ({
      id: row.id,
      platform: row.platform,
      handle: row.handle,
      displayName: row.displayName,
      disconnected: row.disconnected,
      needsReconnect: row.needsReconnect,
      capabilities: row.capabilities as SocialSettings["accounts"][number]["capabilities"],
    })),
  };
}

export async function updateSocialSettings(
  workspaceId: string,
  patch: UpdateSocialSettingsInput,
): Promise<SocialSettings> {
  const current = await getZernioCredentials(workspaceId);
  let nextKey = current.apiKey;
  let nextProfileId = current.profileId;

  if (patch.apiKey !== undefined) {
    const trimmed = patch.apiKey.trim();
    nextKey = trimmed.length > 0 ? trimmed : null;
  }
  if (patch.profileId !== undefined) {
    const trimmed = patch.profileId?.trim() ?? "";
    nextProfileId = trimmed.length > 0 ? trimmed : null;
  }

  // Ensure one profile per workspace when a new key is saved.
  if (nextKey && !nextProfileId) {
    nextProfileId = await ensureWorkspaceProfile(workspaceId, nextKey);
  }

  await db
    .insert(workspaceIntegrationSecrets)
    .values({
      workspaceId,
      zernioApiKey: nextKey,
      zernioProfileId: nextProfileId,
    })
    .onConflictDoUpdate({
      target: workspaceIntegrationSecrets.workspaceId,
      set: {
        zernioApiKey: nextKey,
        zernioProfileId: nextProfileId,
        updatedAt: new Date(),
      },
    });

  if (nextKey && nextProfileId) {
    try {
      await ensureZernioWebhook(workspaceId, nextKey);
      const adapter = await createZernioAdapter(workspaceId);
      if (adapter) {
        const accounts = await adapter.listAccounts();
        setZernioAccountCount(workspaceId, accounts.length);
      }
    } catch {
      // Settings remain readable if webhook/profile sync fails.
    }
  }

  if (!nextKey) {
    await clearWebhookFields(workspaceId);
  }

  return getSocialSettings(workspaceId);
}

export async function testSocialConnection(
  workspaceId: string,
): Promise<SocialTestConnectionResult> {
  const creds = await getZernioCredentials(workspaceId);
  if (!creds.apiKey) {
    return {
      ok: false,
      error: "Social (Zernio) API key is not configured.",
      profileId: null,
      accountCount: null,
    };
  }
  try {
    const client = new ZernioClient({
      apiKey: creds.apiKey,
      rateKey: workspaceId,
    });
    await client.verify();
    let profileId = creds.profileId;
    if (!profileId) {
      profileId = await ensureWorkspaceProfile(workspaceId, creds.apiKey);
      await db
        .insert(workspaceIntegrationSecrets)
        .values({ workspaceId, zernioProfileId: profileId })
        .onConflictDoUpdate({
          target: workspaceIntegrationSecrets.workspaceId,
          set: { zernioProfileId: profileId, updatedAt: new Date() },
        });
    }
    const accounts = await client.listAccounts({ profileId });
    setZernioAccountCount(workspaceId, accounts.length);
    return {
      ok: true,
      error: null,
      profileId,
      accountCount: accounts.length,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof ZernioApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Social connection test failed.",
      profileId: creds.profileId,
      accountCount: null,
    };
  }
}

export async function startSocialAccountConnect(
  workspaceId: string,
  platform: string,
  options?: { redirectUrl?: string; reconnectAccountId?: string },
): Promise<{ url: string }> {
  const creds = await getZernioCredentials(workspaceId);
  if (!creds.apiKey) {
    throw new ZernioApiError(400, "", "Social API key is not configured");
  }
  let profileId = creds.profileId;
  if (!profileId) {
    profileId = await ensureWorkspaceProfile(workspaceId, creds.apiKey);
    await db
      .insert(workspaceIntegrationSecrets)
      .values({ workspaceId, zernioProfileId: profileId })
      .onConflictDoUpdate({
        target: workspaceIntegrationSecrets.workspaceId,
        set: { zernioProfileId: profileId, updatedAt: new Date() },
      });
  }
  const client = new ZernioClient({
    apiKey: creds.apiKey,
    rateKey: workspaceId,
  });
  // Accept normalized platforms or raw Zernio path segments.
  const connectPlatform = normalizeConnectPlatform(platform);
  return client.getConnectUrl({
    platform: connectPlatform,
    profileId,
    headless: true,
    redirectUrl: options?.redirectUrl,
    reconnectAccountId: options?.reconnectAccountId,
  });
}

export async function disconnectSocialAccount(
  workspaceId: string,
  accountId: string,
): Promise<SocialSettings> {
  const creds = await getZernioCredentials(workspaceId);
  if (!creds.apiKey) {
    throw new ZernioApiError(400, "", "Social API key is not configured");
  }
  const externalId = accountId.startsWith("zernio-account:")
    ? accountId.slice("zernio-account:".length)
    : accountId;
  const client = new ZernioClient({
    apiKey: creds.apiKey,
    rateKey: workspaceId,
  });
  await client.disconnectAccount(externalId);
  await db
    .update(socialAccounts)
    .set({
      disconnected: true,
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(socialAccounts.workspaceId, workspaceId),
        eq(socialAccounts.externalId, externalId),
        eq(socialAccounts.provider, "zernio"),
      ),
    );
  return getSocialSettings(workspaceId);
}

export async function syncSocialAccounts(
  workspaceId: string,
): Promise<SocialSettings> {
  const adapter = await createZernioAdapter(workspaceId);
  if (!adapter) {
    throw new ZernioApiError(400, "", "Social API key is not configured");
  }
  await adapter.listAccounts();
  return getSocialSettings(workspaceId);
}

export async function listZernioWebhookSecrets(): Promise<
  Array<{ workspaceId: string; secret: string }>
> {
  const rows = await db
    .select({
      workspaceId: workspaceIntegrationSecrets.workspaceId,
      secret: workspaceIntegrationSecrets.zernioWebhookSecret,
    })
    .from(workspaceIntegrationSecrets);
  return rows
    .map((row) => ({
      workspaceId: row.workspaceId,
      secret: row.secret?.trim() || "",
    }))
    .filter((row) => row.secret.length > 0);
}

export async function setAnalyticsCursor(
  workspaceId: string,
  cursor: string | null,
): Promise<void> {
  await db
    .insert(workspaceIntegrationSecrets)
    .values({
      workspaceId,
      zernioAnalyticsCursor: cursor,
    })
    .onConflictDoUpdate({
      target: workspaceIntegrationSecrets.workspaceId,
      set: {
        zernioAnalyticsCursor: cursor,
        updatedAt: new Date(),
      },
    });
}

async function ensureWorkspaceProfile(
  workspaceId: string,
  apiKey: string,
): Promise<string> {
  const client = new ZernioClient({ apiKey, rateKey: workspaceId });
  const profiles = await client.listProfiles();
  if (profiles.length > 0) {
    return profiles[0]!.id;
  }
  const created = await client.createProfile({
    name: `BacksterOS ${workspaceId.slice(0, 8)}`,
  });
  return created.id;
}

function publicWebhookBaseUrl(): string | null {
  const raw =
    process.env.BACKSTEROS_PUBLIC_API_URL?.trim() ||
    process.env.CORE_PUBLIC_URL?.trim() ||
    process.env.AGENT_DOOR_PUBLIC_URL?.trim() ||
    "";
  return raw ? raw.replace(/\/$/, "") : null;
}

export function socialWebhookUrl(): string | null {
  const base = publicWebhookBaseUrl();
  return base ? `${base}/api/v1/webhooks/social/zernio` : null;
}

async function ensureZernioWebhook(
  workspaceId: string,
  apiKey: string,
): Promise<void> {
  const url = socialWebhookUrl();
  if (!url) return;

  const current = await getZernioCredentials(workspaceId);
  const client = new ZernioClient({ apiKey, rateKey: workspaceId });
  const secret =
    current.webhookSecret || randomBytes(32).toString("base64url");

  if (current.webhookId && current.webhookUrl === url) {
    return;
  }

  if (current.webhookId) {
    try {
      await client.deleteWebhook(current.webhookId);
    } catch {
      // Continue and create a fresh subscription.
    }
  }

  const created = await client.createWebhook({
    name: "BacksterOS",
    url,
    secret,
    events: [...WEBHOOK_EVENTS],
  });

  await db
    .insert(workspaceIntegrationSecrets)
    .values({
      workspaceId,
      zernioWebhookId: created.id,
      zernioWebhookSecret: secret,
      zernioWebhookUrl: url,
    })
    .onConflictDoUpdate({
      target: workspaceIntegrationSecrets.workspaceId,
      set: {
        zernioWebhookId: created.id,
        zernioWebhookSecret: secret,
        zernioWebhookUrl: url,
        updatedAt: new Date(),
      },
    });
}

async function clearWebhookFields(workspaceId: string): Promise<void> {
  await db
    .insert(workspaceIntegrationSecrets)
    .values({
      workspaceId,
      zernioWebhookId: null,
      zernioWebhookSecret: null,
      zernioWebhookUrl: null,
      zernioAnalyticsCursor: null,
    })
    .onConflictDoUpdate({
      target: workspaceIntegrationSecrets.workspaceId,
      set: {
        zernioWebhookId: null,
        zernioWebhookSecret: null,
        zernioWebhookUrl: null,
        zernioAnalyticsCursor: null,
        updatedAt: new Date(),
      },
    });
}

function normalizeConnectPlatform(platform: string): string {
  const trimmed = platform.trim().toLowerCase();
  const aliases: Record<string, string> = {
    x: "twitter",
    twitter: "twitter",
    facebook_page: "facebook",
    facebook: "facebook",
    instagram: "instagram",
    linkedin_personal: "linkedin",
    linkedin_org: "linkedin",
    linkedin: "linkedin",
    youtube: "youtube",
    google_business: "googlebusiness",
    googlebusiness: "googlebusiness",
    whatsapp: "whatsapp",
    threads: "threads",
    bluesky: "bluesky",
    tiktok: "tiktok",
    reddit: "reddit",
    telegram: "telegram",
  };
  return aliases[trimmed] ?? trimmed;
}

/** Stable id helper for webhook event rows. */
export function socialWebhookEventRowId(
  provider: string,
  eventId: string,
): string {
  return createHash("sha256")
    .update(`social-webhook:${provider}:${eventId}`)
    .digest("hex")
    .slice(0, 21);
}

export { newId };

import { eq, isNotNull } from "drizzle-orm";

import type {
  ChatwootSettings,
  ChatwootTestConnectionResult,
  UpdateChatwootSettingsInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import { workspaceIntegrationSecrets } from "../db/schema.js";
import { ChatwootApiError, ChatwootClient } from "../lib/chatwoot-client.js";
import { chatwootWebhookUrl } from "../lib/chatwoot-webhook-url.js";
import { previewCursorApiKey } from "./cursor-settings.js";

export type ChatwootCredentials = {
  baseUrl: string;
  accountId: string;
  apiAccessToken: string;
};

export type ChatwootWebhookSecretRow = {
  workspaceId: string;
  secret: string;
  accountId: string | null;
};

type SecretRow = {
  chatwootBaseUrl: string | null;
  chatwootAccountId: string | null;
  chatwootApiAccessToken: string | null;
  chatwootWebhookSecret: string | null;
};

async function getSecretRow(workspaceId: string): Promise<SecretRow | null> {
  const [row] = await db
    .select({
      chatwootBaseUrl: workspaceIntegrationSecrets.chatwootBaseUrl,
      chatwootAccountId: workspaceIntegrationSecrets.chatwootAccountId,
      chatwootApiAccessToken: workspaceIntegrationSecrets.chatwootApiAccessToken,
      chatwootWebhookSecret: workspaceIntegrationSecrets.chatwootWebhookSecret,
    })
    .from(workspaceIntegrationSecrets)
    .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId))
    .limit(1);
  return row ?? null;
}

export function previewChatwootApiToken(token: string): string {
  return previewCursorApiKey(token);
}

export async function getChatwootCredentials(
  workspaceId: string,
): Promise<ChatwootCredentials | null> {
  const row = await getSecretRow(workspaceId);
  const baseUrl = row?.chatwootBaseUrl?.trim() || null;
  const accountId = row?.chatwootAccountId?.trim() || null;
  const apiAccessToken = row?.chatwootApiAccessToken?.trim() || null;
  if (!baseUrl || !accountId || !apiAccessToken) return null;
  return { baseUrl, accountId, apiAccessToken };
}

export async function getChatwootWebhookSecret(
  workspaceId: string,
): Promise<string | null> {
  const row = await getSecretRow(workspaceId);
  const secret = row?.chatwootWebhookSecret?.trim();
  return secret || null;
}

export function createChatwootClient(
  credentials: ChatwootCredentials,
): ChatwootClient {
  return new ChatwootClient(credentials);
}

export async function getChatwootSettings(
  workspaceId: string,
): Promise<ChatwootSettings> {
  const row = await getSecretRow(workspaceId);
  const baseUrl = row?.chatwootBaseUrl?.trim() || null;
  const accountId = row?.chatwootAccountId?.trim() || null;
  const token = row?.chatwootApiAccessToken?.trim() || null;
  const webhookSecret = row?.chatwootWebhookSecret?.trim() || null;
  return {
    baseUrl,
    accountId,
    apiTokenConfigured: Boolean(token),
    apiTokenPreview: token ? previewChatwootApiToken(token) : null,
    webhookSecretConfigured: Boolean(webhookSecret),
    connected: Boolean(baseUrl && accountId && token),
    webhookUrl: chatwootWebhookUrl(),
  };
}

export async function updateChatwootSettings(
  workspaceId: string,
  patch: UpdateChatwootSettingsInput,
): Promise<ChatwootSettings> {
  const current = await getSecretRow(workspaceId);
  let nextBaseUrl = current?.chatwootBaseUrl ?? null;
  let nextAccountId = current?.chatwootAccountId ?? null;
  let nextToken = current?.chatwootApiAccessToken ?? null;
  let nextWebhookSecret = current?.chatwootWebhookSecret ?? null;

  if (patch.baseUrl !== undefined) {
    const trimmed = patch.baseUrl.trim().replace(/\/+$/, "");
    nextBaseUrl = trimmed.length > 0 ? trimmed : null;
  }
  if (patch.accountId !== undefined) {
    const trimmed = patch.accountId.trim();
    nextAccountId = trimmed.length > 0 ? trimmed : null;
  }
  if (patch.apiAccessToken !== undefined) {
    const trimmed = patch.apiAccessToken.trim();
    nextToken = trimmed.length > 0 ? trimmed : null;
  }
  if (patch.webhookSecret !== undefined) {
    const trimmed = patch.webhookSecret.trim();
    nextWebhookSecret = trimmed.length > 0 ? trimmed : null;
  }

  await db
    .insert(workspaceIntegrationSecrets)
    .values({
      workspaceId,
      chatwootBaseUrl: nextBaseUrl,
      chatwootAccountId: nextAccountId,
      chatwootApiAccessToken: nextToken,
      chatwootWebhookSecret: nextWebhookSecret,
    })
    .onConflictDoUpdate({
      target: workspaceIntegrationSecrets.workspaceId,
      set: {
        chatwootBaseUrl: nextBaseUrl,
        chatwootAccountId: nextAccountId,
        chatwootApiAccessToken: nextToken,
        chatwootWebhookSecret: nextWebhookSecret,
        updatedAt: new Date(),
      },
    });

  return getChatwootSettings(workspaceId);
}

export async function testChatwootConnection(
  workspaceId: string,
): Promise<ChatwootTestConnectionResult> {
  const credentials = await getChatwootCredentials(workspaceId);
  if (!credentials) {
    return {
      ok: false,
      error:
        "Chatwoot is not fully configured. Set base URL, account id, and access token in Settings → Chatwoot.",
      inboxCount: null,
    };
  }

  try {
    const inboxes = await createChatwootClient(credentials).listInboxes();
    return { ok: true, error: null, inboxCount: inboxes.length };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof ChatwootApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Chatwoot connection test failed.",
      inboxCount: null,
    };
  }
}

export async function listChatwootWebhookSecrets(): Promise<
  ChatwootWebhookSecretRow[]
> {
  const rows = await db
    .select({
      workspaceId: workspaceIntegrationSecrets.workspaceId,
      secret: workspaceIntegrationSecrets.chatwootWebhookSecret,
      accountId: workspaceIntegrationSecrets.chatwootAccountId,
    })
    .from(workspaceIntegrationSecrets)
    .where(isNotNull(workspaceIntegrationSecrets.chatwootWebhookSecret));

  return rows
    .map((row) => ({
      workspaceId: row.workspaceId,
      secret: row.secret?.trim() ?? "",
      accountId: row.accountId?.trim() || null,
    }))
    .filter((row) => row.secret.length > 0);
}

import { eq } from "drizzle-orm";
import type {
  AgentAttentionNotificationPayload,
  InboxTriageNotificationPayload,
} from "@backsteros/contracts";

import { devicePushTokens } from "../db/schema.js";
import { newId } from "../lib/crypto.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const DEDUPE_TTL_MS = 60_000;
const recentNotificationKeys = new Map<string, number>();

export type WorkspacePushPayload =
  | InboxTriageNotificationPayload
  | AgentAttentionNotificationPayload;

export function clearInboxTriagePushDedupe(): void {
  recentNotificationKeys.clear();
}

export function shouldSkipInboxTriagePush(key: string, now = Date.now()): boolean {
  pruneDedupe(now);
  const trimmed = key.trim();
  if (!trimmed) return true;
  if (recentNotificationKeys.has(trimmed)) return true;
  recentNotificationKeys.set(trimmed, now + DEDUPE_TTL_MS);
  return false;
}

function pruneDedupe(now: number): void {
  for (const [key, expiresAt] of recentNotificationKeys) {
    if (expiresAt <= now) recentNotificationKeys.delete(key);
  }
}

async function getDb() {
  const { db } = await import("../db/index.js");
  return db;
}

export async function upsertDevicePushToken(input: {
  workspaceId: string;
  userId: string;
  platform: string;
  token: string;
  deviceName?: string | null;
}) {
  const token = input.token.trim();
  if (!token) throw new Error("PUSH_TOKEN_REQUIRED");
  const db = await getDb();

  const [existing] = await db
    .select({ id: devicePushTokens.id })
    .from(devicePushTokens)
    .where(eq(devicePushTokens.token, token))
    .limit(1);

  if (existing) {
    const [row] = await db
      .update(devicePushTokens)
      .set({
        workspaceId: input.workspaceId,
        userId: input.userId,
        platform: input.platform,
        deviceName: input.deviceName ?? null,
        updatedAt: new Date(),
      })
      .where(eq(devicePushTokens.id, existing.id))
      .returning();
    return row ?? null;
  }

  const [row] = await db
    .insert(devicePushTokens)
    .values({
      id: newId(),
      workspaceId: input.workspaceId,
      userId: input.userId,
      platform: input.platform,
      token,
      deviceName: input.deviceName ?? null,
    })
    .returning();
  return row ?? null;
}

export async function deleteDevicePushToken(input: {
  workspaceId: string;
  userId: string;
  token: string;
}) {
  const token = input.token.trim();
  if (!token) return false;
  const db = await getDb();
  const rows = await db
    .delete(devicePushTokens)
    .where(eq(devicePushTokens.token, token))
    .returning({ id: devicePushTokens.id });
  return rows.length > 0;
}

export async function notifyWorkspacePush(
  workspaceId: string,
  payload: WorkspacePushPayload,
): Promise<{ sent: number; skipped: boolean }> {
  if (shouldSkipInboxTriagePush(payload.key)) {
    return { sent: 0, skipped: true };
  }

  const db = await getDb();
  const tokens = await db
    .select({ token: devicePushTokens.token })
    .from(devicePushTokens)
    .where(eq(devicePushTokens.workspaceId, workspaceId));

  if (tokens.length === 0) {
    return { sent: 0, skipped: false };
  }

  const messages = tokens.map((row) => ({
    to: row.token,
    sound: "default",
    title: payload.title,
    body: payload.body,
    data: {
      key: payload.key,
      kind: payload.kind,
      href: payload.href,
    },
  }));

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim();
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Expo push failed (${response.status})${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
  }

  return { sent: messages.length, skipped: false };
}

export async function notifyInboxTriage(
  workspaceId: string,
  payload: InboxTriageNotificationPayload,
): Promise<{ sent: number; skipped: boolean }> {
  return notifyWorkspacePush(workspaceId, payload);
}

import { and, eq, lt } from "drizzle-orm";

import type {
  EmailAgentCallbackPoll,
  EmailAgentCallbackResult,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import { emailAgentCallbacks } from "../db/schema.js";
import {
  EMAIL_AGENT_CALLBACK_TTL_MS,
  buildEmailAgentCallbackUrl,
  emailAgentTokenHashesEqual,
  generateEmailAgentCallbackToken,
  hashEmailAgentCallbackToken,
  parseEmailAgentCallbackResult,
} from "./email-agent-callback-parse.js";

export {
  EMAIL_AGENT_CALLBACK_TTL_MS,
  buildEmailAgentCallbackUrl,
  generateEmailAgentCallbackToken,
  hashEmailAgentCallbackToken,
  parseEmailAgentCallbackResult,
  resolveEmailAgentCallbackPublicBase,
} from "./email-agent-callback-parse.js";

async function pruneExpired(now = new Date()): Promise<void> {
  await db
    .delete(emailAgentCallbacks)
    .where(lt(emailAgentCallbacks.expiresAt, now));
}

export async function registerEmailAgentCallback(input: {
  workspaceId: string;
  requestId: string;
  inboxId: string;
  messageId: string;
}): Promise<{ requestId: string; callbackUrl: string; expiresAt: string } | { conflict: true }> {
  await pruneExpired();
  const existing = await db
    .select()
    .from(emailAgentCallbacks)
    .where(eq(emailAgentCallbacks.requestId, input.requestId))
    .limit(1);
  const row = existing[0];
  if (row?.result != null) {
    return { conflict: true };
  }

  const token = generateEmailAgentCallbackToken();
  const tokenHash = hashEmailAgentCallbackToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + EMAIL_AGENT_CALLBACK_TTL_MS);

  if (row) {
    if (row.workspaceId !== input.workspaceId) {
      return { conflict: true };
    }
    await db
      .update(emailAgentCallbacks)
      .set({
        tokenHash,
        expiresAt,
        inboxId: input.inboxId,
        messageId: input.messageId,
      })
      .where(eq(emailAgentCallbacks.requestId, input.requestId));
  } else {
    await db.insert(emailAgentCallbacks).values({
      requestId: input.requestId,
      workspaceId: input.workspaceId,
      inboxId: input.inboxId,
      messageId: input.messageId,
      tokenHash,
      result: null,
      createdAt: now,
      expiresAt,
    });
  }

  return {
    requestId: input.requestId,
    callbackUrl: buildEmailAgentCallbackUrl(input.requestId, token),
    expiresAt: expiresAt.toISOString(),
  };
}

export async function readEmailAgentCallback(
  workspaceId: string,
  requestId: string,
): Promise<EmailAgentCallbackPoll | null> {
  await pruneExpired();
  const rows = await db
    .select()
    .from(emailAgentCallbacks)
    .where(
      and(
        eq(emailAgentCallbacks.requestId, requestId),
        eq(emailAgentCallbacks.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.result == null) {
    return { pending: true };
  }
  const result = parseEmailAgentCallbackResult(row.result);
  if (!result) {
    return { pending: true };
  }
  return { pending: false, result };
}

export async function loadEmailAgentCallbackRow(requestId: string): Promise<{
  workspaceId: string;
  inboxId: string;
  messageId: string;
  tokenHash: string;
  result: unknown;
} | null> {
  await pruneExpired();
  const rows = await db
    .select()
    .from(emailAgentCallbacks)
    .where(eq(emailAgentCallbacks.requestId, requestId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    workspaceId: row.workspaceId,
    inboxId: row.inboxId,
    messageId: row.messageId,
    tokenHash: row.tokenHash,
    result: row.result,
  };
}

export async function storeEmailAgentCallbackResult(input: {
  requestId: string;
  token: string;
  result: EmailAgentCallbackResult;
}): Promise<"ok" | "unknown" | "unauthorized" | "conflict" | "mismatch"> {
  if (input.result.requestId !== input.requestId) {
    return "mismatch";
  }
  const row = await loadEmailAgentCallbackRow(input.requestId);
  if (!row) return "unknown";
  if (
    !emailAgentTokenHashesEqual(
      row.tokenHash,
      hashEmailAgentCallbackToken(input.token),
    )
  ) {
    return "unauthorized";
  }
  if (row.result != null) return "conflict";

  await db
    .update(emailAgentCallbacks)
    .set({ result: input.result })
    .where(eq(emailAgentCallbacks.requestId, input.requestId));
  return "ok";
}

import { and, eq, lt } from "drizzle-orm";

import type {
  FileTaskCallbackCreated,
  FileTaskCallbackPoll,
  FileTaskCallbackResult,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import { fileTaskCallbacks } from "../db/schema.js";
import {
  FILE_TASK_CALLBACK_TTL_MS,
  buildFileTaskCallbackUrl,
  generateFileTaskCallbackToken,
  hashFileTaskCallbackToken,
  parseFileTaskCallbackResult,
  tokenHashesEqual,
} from "./file-task-callback-parse.js";

export {
  DEFAULT_FILE_TASK_CALLBACK_PUBLIC_URL,
  FILE_TASK_CALLBACK_TTL_MS,
  buildFileTaskCallbackUrl,
  generateFileTaskCallbackToken,
  hashFileTaskCallbackToken,
  parseFileTaskCallbackResult,
  resolveFileTaskCallbackPublicBase,
  tokenHashesEqual,
} from "./file-task-callback-parse.js";

async function pruneExpired(now = new Date()): Promise<void> {
  await db
    .delete(fileTaskCallbacks)
    .where(lt(fileTaskCallbacks.expiresAt, now));
}

export async function registerFileTaskCallback(
  workspaceId: string,
  requestId: string,
): Promise<FileTaskCallbackCreated | { conflict: true }> {
  await pruneExpired();
  const existing = await db
    .select()
    .from(fileTaskCallbacks)
    .where(eq(fileTaskCallbacks.requestId, requestId))
    .limit(1);
  const row = existing[0];
  if (row?.result != null) {
    return { conflict: true };
  }

  const token = generateFileTaskCallbackToken();
  const tokenHash = hashFileTaskCallbackToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + FILE_TASK_CALLBACK_TTL_MS);

  if (row) {
    if (row.workspaceId !== workspaceId) {
      return { conflict: true };
    }
    await db
      .update(fileTaskCallbacks)
      .set({ tokenHash, expiresAt })
      .where(eq(fileTaskCallbacks.requestId, requestId));
  } else {
    await db.insert(fileTaskCallbacks).values({
      requestId,
      workspaceId,
      tokenHash,
      result: null,
      createdAt: now,
      expiresAt,
    });
  }

  return {
    requestId,
    callbackUrl: buildFileTaskCallbackUrl(requestId, token),
    expiresAt: expiresAt.toISOString(),
  };
}

export async function readFileTaskCallback(
  workspaceId: string,
  requestId: string,
): Promise<FileTaskCallbackPoll | null> {
  await pruneExpired();
  const rows = await db
    .select()
    .from(fileTaskCallbacks)
    .where(
      and(
        eq(fileTaskCallbacks.requestId, requestId),
        eq(fileTaskCallbacks.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.result == null) {
    return { pending: true };
  }
  const result = parseFileTaskCallbackResult(row.result);
  if (!result) {
    return { pending: true };
  }
  return { pending: false, result };
}

export async function storePublicFileTaskCallback(input: {
  readonly requestId: string;
  readonly token: string;
  readonly result: FileTaskCallbackResult;
}): Promise<"ok" | "unknown" | "unauthorized" | "conflict" | "mismatch"> {
  if (input.result.requestId !== input.requestId) {
    return "mismatch";
  }
  await pruneExpired();
  const rows = await db
    .select()
    .from(fileTaskCallbacks)
    .where(eq(fileTaskCallbacks.requestId, input.requestId))
    .limit(1);
  const row = rows[0];
  if (!row) return "unknown";
  if (!tokenHashesEqual(row.tokenHash, hashFileTaskCallbackToken(input.token))) {
    return "unauthorized";
  }
  if (row.result != null) return "conflict";

  await db
    .update(fileTaskCallbacks)
    .set({ result: input.result })
    .where(eq(fileTaskCallbacks.requestId, input.requestId));
  return "ok";
}

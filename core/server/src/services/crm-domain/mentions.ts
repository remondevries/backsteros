import { and, desc, eq } from "drizzle-orm";

import { mentions } from "../../db/schema.js";
import { db } from "../../db/index.js";
import type { DbExecutor } from "./shared.js";
import { newId } from "../../lib/crypto.js";
export function listMentions(workspaceId: string, userId?: string | null) {
  const conditions = [eq(mentions.workspaceId, workspaceId)];
  if (userId) conditions.push(eq(mentions.userId, userId));
  return db.select().from(mentions).where(and(...conditions)).orderBy(desc(mentions.createdAt));
}

export async function getMentionById(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select()
    .from(mentions)
    .where(and(eq(mentions.workspaceId, workspaceId), eq(mentions.id, id)))
    .limit(1);
  return row ?? null;
}

export async function createMention(
  workspaceId: string,
  input: {
    userId?: string | null;
    sourceType: string;
    sourceId: string;
    excerpt?: string | null;
    readAt?: string | null;
  },
  id = newId(),
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .insert(mentions)
    .values({
      id,
      workspaceId,
      userId: input.userId ?? null,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      excerpt: input.excerpt ?? null,
      readAt: input.readAt ? new Date(input.readAt) : null,
    })
    .returning();
  return row!;
}

export async function markMentionRead(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .update(mentions)
    .set({ readAt: new Date() })
    .where(and(eq(mentions.workspaceId, workspaceId), eq(mentions.id, id)))
    .returning();
  return row ?? null;
}

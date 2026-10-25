import { eq } from "drizzle-orm";

import type { DbExecutor } from "./shared.js";
import { db } from "../../db/index.js";
import { workspaceSettings } from "../../db/schema.js";
export async function getSettings(workspaceId: string, executor: DbExecutor = db) {
  const [row] = await executor
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId))
    .limit(1);
  return row?.settings ?? {};
}

export async function updateSettings(
  workspaceId: string,
  patch: Record<string, unknown>,
  executor: DbExecutor = db,
) {
  const current = await getSettings(workspaceId, executor);
  let next: Record<string, unknown> = { ...current, ...patch };
  // Cloud must never persist a peer Mac vaultPath (or any machine-local key).
  if (process.env.CORE_REPLICATION_ROLE?.trim().toLowerCase() === "cloud") {
    const { vaultPath: _ignored, ...rest } = next;
    next = rest;
  }
  const [row] = await executor
    .insert(workspaceSettings)
    .values({ workspaceId, settings: next })
    .onConflictDoUpdate({
      target: workspaceSettings.workspaceId,
      set: { settings: next, updatedAt: new Date() },
    })
    .returning();
  return row!.settings;
}

/** Replace settings JSON wholesale (used to scrub machine-local keys). */
export async function replaceSettings(
  workspaceId: string,
  settings: Record<string, unknown>,
  executor: DbExecutor = db,
) {
  let next = { ...settings };
  if (process.env.CORE_REPLICATION_ROLE?.trim().toLowerCase() === "cloud") {
    const { vaultPath: _ignored, ...rest } = next;
    next = rest;
  }
  const [row] = await executor
    .insert(workspaceSettings)
    .values({ workspaceId, settings: next })
    .onConflictDoUpdate({
      target: workspaceSettings.workspaceId,
      set: { settings: next, updatedAt: new Date() },
    })
    .returning();
  return row!.settings;
}

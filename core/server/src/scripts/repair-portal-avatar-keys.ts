/**
 * Repair portal avatars that were written to the personal `/avatar` object
 * (shared key) and never set `portal_avatar_*` on the contact.
 *
 * For each `avatars` row with entity_type = avatar_portal whose storage_key
 * ends with `/avatar`:
 *  1. Copy the blob to `…/avatar-portal`
 *  2. Point the portal avatar row + contact.portal_avatar_* at the new key
 *  3. If the personal contact avatar still points at the old shared key,
 *     clear it (the personal file was overwritten by the portal upload)
 *
 * Usage (from core/server):
 *   pnpm exec tsx --env-file=.env src/scripts/repair-portal-avatar-keys.ts
 */
import { and, eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { avatars, contacts } from "../db/schema.js";
import {
  buildPrivateStorageKey,
  getObject,
  putObject,
} from "../lib/storage.js";

async function main() {
  const rows = await db
    .select()
    .from(avatars)
    .where(eq(avatars.entityType, "avatar_portal"));

  let repaired = 0;
  let clearedPersonal = 0;

  for (const row of rows) {
    const key = row.storageKey ?? "";
    const alreadyPortal = key.endsWith("/avatar-portal");
    const sharedPersonalKey = key.endsWith("/avatar");

    const portalKey = alreadyPortal
      ? key
      : buildPrivateStorageKey(
          row.workspaceId,
          "avatars",
          row.entityId,
          "avatar-portal",
        );

    // Ensure the portal blob exists at the portal key (DB may already point
    // at avatar-portal after a metadata-only sync while the vault still only
    // has the legacy shared `/avatar` object).
    let portalBytes: Uint8Array | null = null;
    try {
      portalBytes = (await getObject(portalKey)).bytes;
    } catch {
      portalBytes = null;
    }
    if (!portalBytes) {
      const sourceKey = sharedPersonalKey
        ? key
        : buildPrivateStorageKey(
            row.workspaceId,
            "avatars",
            row.entityId,
            "avatar",
          );
      try {
        const object = await getObject(sourceKey);
        await putObject(portalKey, object.bytes, row.contentType);
      } catch (error) {
        console.warn(
          `skip blob copy contact=${row.entityId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    if (sharedPersonalKey || row.storageKey !== portalKey) {
      await db
        .update(avatars)
        .set({
          storageKey: portalKey,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(avatars.workspaceId, row.workspaceId),
            eq(avatars.entityType, "avatar_portal"),
            eq(avatars.entityId, row.entityId),
          ),
        );
    }

    await db
      .update(contacts)
      .set({
        portalAvatarStorageKey: portalKey,
        portalAvatarContentType: row.contentType,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(contacts.workspaceId, row.workspaceId),
          eq(contacts.id, row.entityId),
        ),
      );

    // Personal cover was overwritten when portal shared `/avatar`.
    if (sharedPersonalKey) {
      const [contact] = await db
        .select({
          avatarStorageKey: contacts.avatarStorageKey,
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.workspaceId, row.workspaceId),
            eq(contacts.id, row.entityId),
          ),
        )
        .limit(1);
      if (contact?.avatarStorageKey === key) {
        await db
          .update(contacts)
          .set({
            avatarStorageKey: null,
            avatarContentType: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(contacts.workspaceId, row.workspaceId),
              eq(contacts.id, row.entityId),
            ),
          );
        await db
          .delete(avatars)
          .where(
            and(
              eq(avatars.workspaceId, row.workspaceId),
              eq(avatars.entityType, "contact"),
              eq(avatars.entityId, row.entityId),
            ),
          );
        clearedPersonal += 1;
      }
    }

    repaired += 1;
    console.log(
      `repaired contact=${row.entityId} portalKey=${portalKey}` +
        (sharedPersonalKey ? " (migrated off shared /avatar)" : ""),
    );
  }

  console.log(
    `done repaired=${repaired} clearedPersonal=${clearedPersonal}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

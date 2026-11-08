import type { BacksterosApiClient } from "@backsteros/api-client";

import {
  invalidateDesktopAvatarCache,
  seedDesktopAvatarCache,
} from "./avatar-src";

export type DesktopAvatarUploadMeta = {
  storageKey: string;
  contentType: string;
};

export type DesktopAvatarActionResult =
  | { ok: true; avatar?: DesktopAvatarUploadMeta }
  | { ok: false; error: string };

export type DesktopAvatarKind =
  | "contact"
  | "avatar_portal"
  | "organization"
  | "bank_account";

export async function uploadDesktopAvatar(
  client: BacksterosApiClient,
  kind: DesktopAvatarKind,
  entityId: string,
  file: File,
): Promise<DesktopAvatarActionResult> {
  try {
    const avatar = await client.uploadAvatar(
      kind,
      entityId,
      file,
      file.type || undefined,
    );
    invalidateDesktopAvatarCache(kind, entityId);
    if (avatar.storageKey) {
      seedDesktopAvatarCache(
        kind,
        { id: entityId, avatarStorageKey: avatar.storageKey },
        file,
      );
    }
    return { ok: true, avatar };
  } catch (reason) {
    return {
      ok: false,
      error:
        reason instanceof Error ? reason.message : "Could not upload avatar.",
    };
  }
}

export async function removeDesktopAvatar(
  client: BacksterosApiClient,
  kind: DesktopAvatarKind,
  entityId: string,
): Promise<DesktopAvatarActionResult> {
  try {
    await client.deleteAvatar(kind, entityId);
    invalidateDesktopAvatarCache(kind, entityId);
    return { ok: true };
  } catch (reason) {
    return {
      ok: false,
      error:
        reason instanceof Error ? reason.message : "Could not remove avatar.",
    };
  }
}

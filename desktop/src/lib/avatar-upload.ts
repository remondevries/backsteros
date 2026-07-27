import type { BacksterosApiClient } from "@backsteros/api-client";

export type DesktopAvatarActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function uploadDesktopAvatar(
  client: BacksterosApiClient,
  kind: "contact" | "organization",
  entityId: string,
  file: File,
): Promise<DesktopAvatarActionResult> {
  try {
    await client.uploadAvatar(kind, entityId, file, file.type || undefined);
    return { ok: true };
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
  kind: "contact" | "organization",
  entityId: string,
): Promise<DesktopAvatarActionResult> {
  try {
    await client.deleteAvatar(kind, entityId);
    return { ok: true };
  } catch (reason) {
    return {
      ok: false,
      error:
        reason instanceof Error ? reason.message : "Could not remove avatar.",
    };
  }
}

import type { BacksterosApiClient } from "@backsteros/api-client";
import type { Avatar } from "@backsteros/contracts";
import { File } from "expo-file-system";

export type PickedAvatarImage = {
  uri: string;
  name: string;
  mimeType: string;
};

type DocumentPickerModule = typeof import("expo-document-picker");

function loadDocumentPicker(): DocumentPickerModule {
  try {
    // Lazy require — native module is only needed when picking a file.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-document-picker") as DocumentPickerModule;
  } catch {
    throw new Error(
      "Image picker needs a native rebuild. Run: pnpm exec expo run:ios",
    );
  }
}

/** Open the system picker for a single image (avatar upload). */
export async function pickAvatarImage(): Promise<PickedAvatarImage | null> {
  const DocumentPicker = loadDocumentPicker();
  let result: Awaited<ReturnType<DocumentPickerModule["getDocumentAsync"]>>;
  try {
    result = await DocumentPicker.getDocumentAsync({
      type: ["image/jpeg", "image/png", "image/webp", "image/gif"],
      copyToCacheDirectory: true,
      multiple: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ExpoDocumentPicker|native module/i.test(message)) {
      throw new Error(
        "Image picker needs a native rebuild. Run: pnpm exec expo run:ios",
      );
    }
    throw error;
  }

  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset) return null;

  const name = asset.name?.trim() || "avatar.jpg";
  const mimeType = asset.mimeType?.trim() || guessMimeType(name);
  if (!mimeType.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }

  return { uri: asset.uri, name, mimeType };
}

function guessMimeType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

/** Upload a local image as a contact/organization avatar. */
export async function uploadAvatarFromUri(
  client: BacksterosApiClient,
  kind: "contact" | "organization",
  entityId: string,
  uri: string,
  mimeType: string,
): Promise<{ ok: true; avatar: Avatar } | { ok: false; error: string }> {
  try {
    const file = new File(uri);
    const buffer = await file.arrayBuffer();
    const avatar = await client.uploadAvatar(
      kind,
      entityId,
      buffer,
      mimeType,
    );
    return { ok: true, avatar };
  } catch (reason) {
    return {
      ok: false,
      error:
        reason instanceof Error ? reason.message : "Could not upload avatar.",
    };
  }
}

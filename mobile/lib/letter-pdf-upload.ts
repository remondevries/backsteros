import type { BacksterosApiClient } from "@backsteros/api-client";
import { File } from "expo-file-system";

export type PickedLetterPdf = {
  uri: string;
  name: string;
};

type DocumentPickerModule = typeof import("expo-document-picker");

function loadDocumentPicker(): DocumentPickerModule {
  try {
    // Lazy require — native module is only needed when picking a file.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-document-picker") as DocumentPickerModule;
  } catch {
    throw new Error(
      "PDF picker needs a native rebuild. Run: pnpm exec expo run:ios",
    );
  }
}

/** Open the system document picker for a single PDF. */
export async function pickLetterPdf(): Promise<PickedLetterPdf | null> {
  const DocumentPicker = loadDocumentPicker();
  let result: Awaited<ReturnType<DocumentPickerModule["getDocumentAsync"]>>;
  try {
    result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
      multiple: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ExpoDocumentPicker|native module/i.test(message)) {
      throw new Error(
        "PDF picker needs a native rebuild. Run: pnpm exec expo run:ios",
      );
    }
    throw error;
  }

  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset) return null;

  const name = asset.name?.trim() || "letter.pdf";
  const isPdf =
    asset.mimeType === "application/pdf" ||
    name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    throw new Error("Please choose a PDF file.");
  }

  return { uri: asset.uri, name };
}

/**
 * Upload a local PDF to a letter (attachment endpoint, legacy PDF fallback).
 */
export async function uploadLetterPdfFromUri(
  client: BacksterosApiClient,
  letterId: string,
  uri: string,
  filename: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const file = new File(uri);
    const buffer = await file.arrayBuffer();

    try {
      await client.uploadLetterAttachment(letterId, buffer, filename);
      return { ok: true };
    } catch (error) {
      const status =
        error && typeof error === "object" && "status" in error
          ? Number((error as { status?: number }).status)
          : null;
      if (status === 404) {
        await client.uploadLetterPdf(letterId, buffer, filename);
        return { ok: true };
      }
      throw error;
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not upload PDF.",
    };
  }
}

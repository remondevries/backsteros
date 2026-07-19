import type { BacksterosApiClient } from "@backsteros/api-client";

export async function uploadLetterPdfFile(
  client: BacksterosApiClient,
  letterId: string,
  file: File,
): Promise<
  | { ok: true; attachmentId?: string }
  | { ok: false; error: string }
> {
  if (
    file.type &&
    file.type !== "application/pdf" &&
    !file.name.toLowerCase().endsWith(".pdf")
  ) {
    return { ok: false, error: "Please choose a PDF file." };
  }

  try {
    try {
      const attachment = await client.uploadLetterAttachment(
        letterId,
        file,
        file.name,
      );
      return { ok: true, attachmentId: attachment.id };
    } catch (error) {
      const status =
        error && typeof error === "object" && "status" in error
          ? Number((error as { status?: number }).status)
          : null;
      if (status === 404) {
        await client.uploadLetterPdf(letterId, file, file.name);
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

/**
 * Pick a PDF file and upload it to a letter (attachment endpoint, legacy fallback).
 */
export async function pickAndUploadLetterPdf(
  client: BacksterosApiClient,
  letterId: string,
): Promise<
  | { ok: true; attachmentId?: string }
  | { ok: false; error: string }
> {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/pdf,.pdf";

  const file = await new Promise<File | null>((resolve) => {
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });

  if (!file) return { ok: false, error: "Upload cancelled." };
  return uploadLetterPdfFile(client, letterId, file);
}

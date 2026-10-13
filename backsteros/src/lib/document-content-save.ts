import type { BacksterosApiClient } from "@backsteros/api-client";
import { ApiClientError } from "@backsteros/api-client";

import {
  discardDocumentContentCache,
  fetchDocumentContent,
  writeDocumentContentCache,
  type FetchDocumentContentOptions,
} from "./document-content-cache";

export const DOCUMENT_CONTENT_VERSION_CONFLICT_MESSAGE =
  "This document changed elsewhere. Reloaded the latest version — review and save again.";

export type DocumentContentSaveResult =
  | {
      ok: true;
      content: string;
      contentVersion: number;
      checksum?: string | null;
      skipped?: boolean;
    }
  | {
      ok: false;
      error: string;
      conflict?: true;
      content?: string;
      contentVersion?: number;
      checksum?: string | null;
    };

/** True when PATCH would be a no-op against the last verified/saved body. */
export function shouldSkipDocumentContentSave(
  nextContent: string,
  lastSavedContent: string | null | undefined,
): boolean {
  if (lastSavedContent == null) return false;
  return nextContent === lastSavedContent;
}

/**
 * PATCH document body with if-match, dirty short-circuit, and conflict refetch.
 * Never sends ifMatchVersion unless contentVersion is set (verified body).
 */
export async function saveVerifiedDocumentContent(input: {
  client: BacksterosApiClient;
  documentId: string;
  content: string;
  contentVersion: number | undefined;
  lastSavedContent: string | null;
  fetchOptions?: Omit<FetchDocumentContentOptions, "force">;
}): Promise<DocumentContentSaveResult> {
  const { client, documentId, content, contentVersion, lastSavedContent } =
    input;

  if (contentVersion == null) {
    return {
      ok: false,
      error: "Document content is not verified yet.",
    };
  }

  if (shouldSkipDocumentContentSave(content, lastSavedContent)) {
    return {
      ok: true,
      skipped: true,
      content: lastSavedContent ?? content,
      contentVersion,
    };
  }

  try {
    const data = await client.requestJson<{
      content: string;
      contentVersion: number;
      checksum?: string | null;
    }>(`/api/v1/documents/${encodeURIComponent(documentId)}/content`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content,
        ifMatchVersion: contentVersion,
      }),
    });
    writeDocumentContentCache(documentId, {
      content: data.content,
      contentVersion: data.contentVersion,
      checksum: data.checksum ?? null,
    });
    return {
      ok: true,
      content: data.content,
      contentVersion: data.contentVersion,
      checksum: data.checksum ?? null,
    };
  } catch (error) {
    const isConflict =
      error instanceof ApiClientError &&
      (error.status === 409 || error.code === "CONTENT_VERSION_CONFLICT");
    if (!isConflict) {
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : "Could not save document.",
      };
    }

    discardDocumentContentCache(documentId);
    const fresh = await fetchDocumentContent(client, documentId, {
      force: true,
      ...input.fetchOptions,
    });
    if (fresh) {
      return {
        ok: false,
        conflict: true,
        error: DOCUMENT_CONTENT_VERSION_CONFLICT_MESSAGE,
        content: fresh.content,
        contentVersion: fresh.contentVersion,
        checksum: fresh.checksum ?? null,
      };
    }
    return {
      ok: false,
      conflict: true,
      error: DOCUMENT_CONTENT_VERSION_CONFLICT_MESSAGE,
    };
  }
}

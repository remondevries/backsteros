import { ApiClientError, type BacksterosApiClient } from "@backsteros/api-client";
import type { DocumentContent } from "@backsteros/contracts";

/** Server refused to replace non-empty Tier-D body with empty content (409). */
export class DocumentContentEmptyBodyRejectedError extends Error {
  constructor() {
    super("Refusing to overwrite non-empty document with empty body");
    this.name = "DocumentContentEmptyBodyRejectedError";
  }
}

export function isEmptyBodyOverNonemptyError(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    error.status === 409 &&
    error.code === "empty_body_over_nonempty"
  );
}

/** Tier D read — on-demand; never bulk-synced to SQLite. */
export async function fetchDocumentContent(
  client: BacksterosApiClient,
  documentId: string,
): Promise<DocumentContent> {
  return client.requestJson<DocumentContent>(
    `/api/v1/documents/${encodeURIComponent(documentId)}/content`,
  );
}

/** Leader-first content write — always REST PATCH with optimistic concurrency. */
export async function saveDocumentContent(
  client: BacksterosApiClient,
  documentId: string,
  content: string,
  ifMatchVersion: number,
): Promise<DocumentContent> {
  try {
    return await client.requestJson<DocumentContent>(
      `/api/v1/documents/${encodeURIComponent(documentId)}/content`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content, ifMatchVersion }),
      },
    );
  } catch (error) {
    if (isEmptyBodyOverNonemptyError(error)) {
      throw new DocumentContentEmptyBodyRejectedError();
    }
    throw error;
  }
}

export function asContentVersion(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

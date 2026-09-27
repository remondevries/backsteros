import type { BacksterosApiClient } from "@backsteros/api-client";

export async function putDocumentProperties(
  client: BacksterosApiClient,
  documentId: string,
  input: {
    properties: Record<string, unknown>;
    ifMatchVersion: number;
  },
): Promise<{
  docKey: string | null;
  properties: Record<string, unknown>;
  frontMatterValid: boolean;
  contentVersion: number;
}> {
  return client.requestJson(
    `/api/v1/documents/${encodeURIComponent(documentId)}/properties`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function documentPropertiesFromApiDocument(document: {
  docKey?: string | null;
  properties?: Record<string, unknown> | null;
  frontMatterValid?: boolean | null;
  contentVersion: number;
}) {
  return {
    docKey: document.docKey ?? null,
    properties: document.properties ?? {},
    frontMatterValid: document.frontMatterValid ?? true,
    contentVersion: document.contentVersion,
  };
}

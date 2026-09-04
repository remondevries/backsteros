import type { BacksterosApiClient } from "@backsteros/api-client";

import {
  documentApiPatchToSqlite,
  patchEntityViaPowerSyncOrApi,
  type MobileEntityPowerSync,
} from "./entity-mutations";
import {
  shouldSkipRestEntityWrite,
  shouldWriteEntityViaPowerSync,
} from "./powersync-write-path";

export type DocumentMetadataPatch = {
  title?: string;
  icon?: string | null;
  path?: string;
  parentId?: string | null;
  sortOrder?: number;
  snippet?: string | null;
};

/** Document title/icon/path — local SQLite first; REST PATCH when offline. */
export async function updateDocumentViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileEntityPowerSync,
  id: string,
  input: DocumentMetadataPatch,
): Promise<void> {
  const apiValues: Record<string, unknown> = {};
  if (input.title !== undefined) apiValues.title = input.title;
  if (input.icon !== undefined) apiValues.icon = input.icon;
  if (input.path !== undefined) apiValues.path = input.path;
  if (input.parentId !== undefined) apiValues.parentId = input.parentId;
  if (input.sortOrder !== undefined) apiValues.sortOrder = input.sortOrder;
  if (input.snippet !== undefined) apiValues.snippet = input.snippet;

  await patchEntityViaPowerSyncOrApi(
    client,
    powerSync,
    "documents",
    id,
    apiValues,
    documentApiPatchToSqlite(apiValues),
  );
}

/** Reparent a folder/document — local `parent_id` then POST /move when not on upload path. */
export async function moveDocumentViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileEntityPowerSync,
  id: string,
  parentId: string | null,
): Promise<void> {
  if (shouldWriteEntityViaPowerSync(powerSync)) {
    await powerSync.patchDocument(id, { parent_id: parentId });
    if (shouldSkipRestEntityWrite(powerSync)) {
      return;
    }
  }

  await client.requestJson(
    `/api/v1/documents/${encodeURIComponent(id)}/move`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parentId }),
    },
  );
}

/** Reorder siblings — local `sort_order` rows then POST /reorder when not on upload path. */
export async function reorderDocumentsViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileEntityPowerSync,
  orderedIds: readonly string[],
): Promise<void> {
  if (orderedIds.length === 0) {
    throw new Error("At least one document is required.");
  }

  if (shouldWriteEntityViaPowerSync(powerSync)) {
    await Promise.all(
      orderedIds.map((id, index) =>
        powerSync.patchDocument(id, { sort_order: index }),
      ),
    );
    if (shouldSkipRestEntityWrite(powerSync)) {
      return;
    }
  }

  await client.requestJson("/api/v1/documents/reorder", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderedIds: [...orderedIds] }),
  });
}

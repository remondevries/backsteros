import { and, desc, eq, gt, isNull } from "drizzle-orm";

import { db } from "../db/index.js";
import { documents, syncEvents } from "../db/schema.js";
import { createApiKey } from "../services/api-keys.js";
import { getCoreReplicationConfig } from "../services/core-replication/config.js";
import { applyPowerSyncBatch } from "../services/sync.js";
import { getDocumentContent } from "../services/documents.js";

const ws = process.env.PROOF_WORKSPACE_ID?.trim() || "ws_legacy_default";
const apiBase = process.env.PROOF_API_URL?.trim() || "http://127.0.0.1:8788";

async function cloudLastSyncId(): Promise<number> {
  const config = getCoreReplicationConfig();
  if (!config) throw new Error("CORE_REPLICATION_NOT_CONFIGURED");
  const response = await fetch(
    `${config.peerUrl}/internal/core-replication/sync-events?workspace_id=${ws}&after=0&limit=1`,
    { headers: { Authorization: `Bearer ${config.secret}` } },
  );
  if (!response.ok) {
    throw new Error(`cloud sync-events failed (${response.status})`);
  }
  const payload = (await response.json()) as { last_sync_id: number };
  return payload.last_sync_id;
}

async function localSyncEventsMax(): Promise<number> {
  const [row] = await db
    .select({ cursor: syncEvents.cursor })
    .from(syncEvents)
    .where(eq(syncEvents.workspaceId, ws))
    .orderBy(desc(syncEvents.cursor))
    .limit(1);
  return row?.cursor ?? 0;
}

async function resolveApiKey(): Promise<string> {
  const fromEnv = process.env.PROOF_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  const { secret } = await createApiKey(ws, "SiChwMAnh6tXSbe-dVIIP", {
    name: `doc-content-leader-proof-${Date.now()}`,
    scopes: ["documents:read", "documents:write"],
  });
  return secret;
}

async function cloudContentEventAfter(
  afterCursor: number,
  documentId: string,
): Promise<{ byteSize: number; contentVersion: number } | null> {
  const config = getCoreReplicationConfig();
  if (!config) throw new Error("CORE_REPLICATION_NOT_CONFIGURED");
  const response = await fetch(
    `${config.peerUrl}/internal/core-replication/sync-events?workspace_id=${ws}&after=${afterCursor}&limit=100`,
    { headers: { Authorization: `Bearer ${config.secret}` } },
  );
  if (!response.ok) {
    throw new Error(`cloud sync-events failed (${response.status})`);
  }
  const payload = (await response.json()) as {
    events: Array<{
      entity: string;
      entity_id: string;
      payload: Record<string, unknown>;
    }>;
  };
  for (const event of payload.events ?? []) {
    if (event.entity !== "document" || event.entity_id !== documentId) continue;
    const byteSize = Number(event.payload.byte_size ?? 0);
    const contentVersion = Number(event.payload.content_version ?? 0);
    if (byteSize > 0 && contentVersion > 1) {
      return { byteSize, contentVersion };
    }
  }
  return null;
}

async function main() {
  const apiKey = await resolveApiKey();
  const marker = `doc-content-leader-proof-${Date.now()}`;
  const title = `Leader content proof ${marker}`;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const path = `${slug}.md`;
  const body = `# ${title}\n\nInitial markdown through leader content PUT.\n`;
  const documentId = crypto.randomUUID().replace(/-/g, "");
  const metadataMutationId = `proof:powersync:doc:${Date.now()}:${crypto.randomUUID()}`;

  const cloudBefore = await cloudLastSyncId();
  const localBefore = await localSyncEventsMax();

  console.log("document_id", documentId);
  console.log("path", path);
  console.log("cloud_last_sync_id_before", cloudBefore);
  console.log("local_sync_events_max_before", localBefore);

  const batchResult = await applyPowerSyncBatch({
    workspaceId: ws,
    deviceId: "proof-document-content-device",
    mutationId: metadataMutationId,
    batch: [
      {
        table: "documents",
        op: "PUT",
        id: documentId,
        data: {
          type: "knowledge",
          kind: "document",
          title,
          path,
          project_id: null,
          parent_id: null,
          icon: null,
          sort_order: 0,
          journal_date: null,
          storage_key: "",
          content_type: "text/markdown",
          byte_size: 0,
          checksum: null,
          snippet: null,
          content_version: 1,
          content_etag: null,
        },
      },
    ],
  });
  console.log("metadata_batch_result", batchResult);

  const contentResponse = await fetch(
    `${apiBase}/api/v1/documents/${encodeURIComponent(documentId)}/content`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: body, ifMatchVersion: 1 }),
    },
  );
  const contentResponseText = await contentResponse.text();
  if (!contentResponse.ok) {
    throw new Error(
      `content PATCH failed (${contentResponse.status}): ${contentResponseText}`,
    );
  }
  const contentPayload = JSON.parse(contentResponseText) as {
    contentVersion: number;
    byteSize: number;
    content: string;
  };

  const cloudAfter = await cloudLastSyncId();
  const localAfter = await localSyncEventsMax();
  const localContent = await getDocumentContent(ws, documentId);
  const cloudEvent = await cloudContentEventAfter(cloudBefore, documentId);

  const [row] = await db
    .select({
      byteSize: documents.byteSize,
      contentVersion: documents.contentVersion,
    })
    .from(documents)
    .where(and(eq(documents.workspaceId, ws), eq(documents.id, documentId)))
    .limit(1);

  const newEvents = await db
    .select({ cursor: syncEvents.cursor })
    .from(syncEvents)
    .where(and(eq(syncEvents.workspaceId, ws), gt(syncEvents.cursor, localBefore)))
    .orderBy(desc(syncEvents.cursor));

  console.log("content_patch_status", contentResponse.status);
  console.log("content_version", contentPayload.contentVersion);
  console.log("byte_size", contentPayload.byteSize);
  console.log("local_row_byte_size", row?.byteSize);
  console.log("local_row_content_version", row?.contentVersion);
  console.log("local_content", localContent?.content);
  console.log("cloud_content_event", cloudEvent);
  console.log("cloud_last_sync_id_after", cloudAfter);
  console.log("local_sync_events_max_after", localAfter);
  console.log(
    "local_sync_events_appended",
    newEvents.length > 0 ? newEvents.map((event) => event.cursor) : "none",
  );

  const cloudAdvanced = cloudAfter > cloudBefore;
  const localCursorUnchanged = localAfter === localBefore;
  const localMatches = localContent?.content === body;
  const cloudMatches = cloudEvent != null && cloudEvent.byteSize > 0;
  const noEmptyOverwrite = (localContent?.content?.length ?? 0) > 0;

  console.log("cloud_advanced", cloudAdvanced);
  console.log("local_cursor_unchanged", localCursorUnchanged);
  console.log("local_content_matches", localMatches);
  console.log("cloud_content_matches", cloudMatches);
  console.log("no_empty_overwrite", noEmptyOverwrite);

  if (!cloudAdvanced) {
    throw new Error("cloud last_sync_id did not advance");
  }
  if (!localCursorUnchanged) {
    throw new Error("local sync_events cursor advanced (fork append)");
  }
  if (!localMatches) {
    throw new Error("local GET content does not match initial body");
  }
  if (!cloudMatches) {
    throw new Error("cloud content sync event missing or empty byte_size");
  }
  if (!noEmptyOverwrite) {
    throw new Error("document body is empty after content commit");
  }
  if ((row?.byteSize ?? 0) === 0) {
    throw new Error("local document metadata still shows byte_size 0");
  }

  console.log("PROOF_OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

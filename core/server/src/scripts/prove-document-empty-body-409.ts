import { and, desc, eq, gt } from "drizzle-orm";

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
    name: `empty-body-409-proof-${Date.now()}`,
    scopes: ["documents:read", "documents:write"],
  });
  return secret;
}

async function seedDocumentWithContent(
  apiKey: string,
): Promise<{ documentId: string; body: string; contentVersion: number }> {
  const marker = `empty-body-409-proof-${Date.now()}`;
  const title = `Empty-body guard proof ${marker}`;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const path = `${slug}.md`;
  const body = `# ${title}\n\nNon-empty seed for empty-overwrite guard.\n`;
  const documentId = crypto.randomUUID().replace(/-/g, "");
  const metadataMutationId = `proof:powersync:empty-body:${Date.now()}:${crypto.randomUUID()}`;

  await applyPowerSyncBatch({
    workspaceId: ws,
    deviceId: "proof-empty-body-device",
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
      `seed content PATCH failed (${contentResponse.status}): ${contentResponseText}`,
    );
  }
  const contentPayload = JSON.parse(contentResponseText) as {
    contentVersion: number;
  };

  return {
    documentId,
    body,
    contentVersion: contentPayload.contentVersion,
  };
}

async function main() {
  const apiKey = await resolveApiKey();
  const seeded = await seedDocumentWithContent(apiKey);

  const cloudBefore = await cloudLastSyncId();
  const localBefore = await localSyncEventsMax();

  console.log("document_id", seeded.documentId);
  console.log("content_version", seeded.contentVersion);
  console.log("cloud_last_sync_id_before", cloudBefore);
  console.log("local_sync_events_max_before", localBefore);

  const emptyResponse = await fetch(
    `${apiBase}/api/v1/documents/${encodeURIComponent(seeded.documentId)}/content`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: "",
        ifMatchVersion: seeded.contentVersion,
      }),
    },
  );
  const emptyBodyText = await emptyResponse.text();
  let emptyPayload: { code?: string; error?: string } = {};
  try {
    emptyPayload = JSON.parse(emptyBodyText) as { code?: string; error?: string };
  } catch {
    emptyPayload = { error: emptyBodyText };
  }

  const cloudAfter = await cloudLastSyncId();
  const localAfter = await localSyncEventsMax();
  const localContent = await getDocumentContent(ws, seeded.documentId);

  const [row] = await db
    .select({
      byteSize: documents.byteSize,
      contentVersion: documents.contentVersion,
    })
    .from(documents)
    .where(
      and(eq(documents.workspaceId, ws), eq(documents.id, seeded.documentId)),
    )
    .limit(1);

  const newEvents = await db
    .select({ cursor: syncEvents.cursor })
    .from(syncEvents)
    .where(and(eq(syncEvents.workspaceId, ws), gt(syncEvents.cursor, localBefore)))
    .orderBy(desc(syncEvents.cursor));

  console.log("empty_patch_status", emptyResponse.status);
  console.log("empty_patch_code", emptyPayload.code);
  console.log("empty_patch_error", emptyPayload.error);
  console.log("local_row_byte_size", row?.byteSize);
  console.log("local_row_content_version", row?.contentVersion);
  console.log("local_content_length", localContent?.content?.length ?? 0);
  console.log("cloud_last_sync_id_after", cloudAfter);
  console.log("local_sync_events_max_after", localAfter);
  console.log(
    "local_sync_events_appended",
    newEvents.length > 0 ? newEvents.map((event) => event.cursor) : "none",
  );

  const got409 = emptyResponse.status === 409;
  const gotCode = emptyPayload.code === "empty_body_over_nonempty";
  const contentPreserved = localContent?.content === seeded.body;
  const versionUnchanged = row?.contentVersion === seeded.contentVersion;
  const byteSizePreserved = (row?.byteSize ?? 0) > 0;
  const cloudCursorUnchanged = cloudAfter === cloudBefore;
  const localCursorUnchanged = localAfter === localBefore;

  console.log("got_409", got409);
  console.log("got_empty_body_code", gotCode);
  console.log("content_preserved", contentPreserved);
  console.log("version_unchanged", versionUnchanged);
  console.log("byte_size_preserved", byteSizePreserved);
  console.log("cloud_cursor_unchanged", cloudCursorUnchanged);
  console.log("local_cursor_unchanged", localCursorUnchanged);

  if (!got409) {
    throw new Error(`expected 409, got ${emptyResponse.status}`);
  }
  if (!gotCode) {
    throw new Error("expected code empty_body_over_nonempty");
  }
  if (!contentPreserved) {
    throw new Error("local content was overwritten with empty body");
  }
  if (!versionUnchanged) {
    throw new Error("content_version advanced after rejected empty PATCH");
  }
  if (!byteSizePreserved) {
    throw new Error("byte_size dropped after rejected empty PATCH");
  }
  if (!cloudCursorUnchanged) {
    throw new Error("cloud last_sync_id advanced on rejected empty PATCH");
  }
  if (!localCursorUnchanged) {
    throw new Error("local sync_events advanced on rejected empty PATCH");
  }

  console.log("PROOF_OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

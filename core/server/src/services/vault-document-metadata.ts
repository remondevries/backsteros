/**
 * Keep Postgres document metadata aligned with on-disk vault markdown.
 * Vault replication writes files without updating documents.byte_size — this
 * module repairs that drift and is invoked after replication applies files.
 */
import { and, eq, isNull } from "drizzle-orm";

import { db } from "../db/index.js";
import { documents } from "../db/schema.js";
import {
  checksumForContent,
  getObject,
  resolveVaultPath,
  snippetForContent,
} from "../lib/storage.js";
import { getCoreReplicationConfig } from "./core-replication/config.js";
import {
  applyVaultFilePut,
  listMarkdownFiles,
} from "./core-replication/vault-replication.js";

export type VaultMetadataReconcileResult = {
  scanned: number;
  metadataUpdated: number;
  pulledFromPeer: number;
  staleZeroMetadata: number;
  missingFileWithBytes: number;
  samples: Array<{
    path: string;
    storageKey: string;
    issue: string;
  }>;
};

function replicationWorkspaceId(): string | null {
  const raw = process.env.CORE_REPLICATION_WORKSPACE_IDS?.trim();
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim();
  return first || null;
}

/** Sync one document row from its vault file (if present). */
export async function syncDocumentMetadataFromStorageKey(
  workspaceId: string,
  storageKey: string,
): Promise<"updated" | "skipped" | "no_row"> {
  const [row] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.workspaceId, workspaceId),
        eq(documents.storageKey, storageKey),
        isNull(documents.deletedAt),
        eq(documents.kind, "document"),
      ),
    )
    .limit(1);

  if (!row) {
    return "no_row";
  }

  let content: string;
  let byteSize: number;
  try {
    const object = await getObject(storageKey);
    content = object.body;
    byteSize = object.byteSize;
  } catch {
    return "skipped";
  }

  const checksum = byteSize > 0 ? checksumForContent(content) : null;
  const snippet = byteSize > 0 ? snippetForContent(content) : null;
  const contentEtag =
    byteSize > 0 ? checksumForContent(content).slice(0, 32) : null;

  if (
    row.byteSize === byteSize &&
    row.checksum === checksum &&
    row.snippet === snippet
  ) {
    return "skipped";
  }

  // Never let an empty on-disk file zero out richer metadata and bump
  // contentVersion — that LWW-wins against a peer that still has the body.
  if (byteSize === 0 && row.byteSize > 0) {
    return "skipped";
  }

  const contentChanged =
    row.byteSize !== byteSize || row.checksum !== checksum;

  await db
    .update(documents)
    .set({
      byteSize,
      checksum,
      snippet,
      contentVersion: contentChanged
        ? row.contentVersion + 1
        : row.contentVersion,
      contentEtag,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, row.id));

  return "updated";
}

/** Pull a single vault markdown path from the replication peer into local vault. */
export async function pullVaultMarkdownFromPeer(
  relativePath: string,
  timeoutMs = 120_000,
): Promise<boolean> {
  const config = getCoreReplicationConfig();
  if (!config || config.role !== "local") {
    return false;
  }

  const vaultRoot = await resolveVaultPath().catch(() => null);
  if (!vaultRoot) {
    return false;
  }

  const url = new URL(`${config.peerUrl}/internal/core-replication/vault/file`);
  url.searchParams.set("path", relativePath);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${config.secret}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      return false;
    }
    const body = (await response.json()) as {
      path?: string;
      mtimeMs?: number;
      contentBase64?: string;
    };
    if (
      typeof body.path !== "string" ||
      typeof body.mtimeMs !== "number" ||
      typeof body.contentBase64 !== "string"
    ) {
      return false;
    }
    await applyVaultFilePut(vaultRoot, {
      path: body.path,
      mtimeMs: body.mtimeMs,
      contentBase64: body.contentBase64,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Scan document rows vs vault files; pull from peer when local body is missing
 * or empty but metadata or peer manifest says there should be content.
 */
export async function reconcileVaultDocumentMetadata(
  workspaceId: string,
  options?: { pullFromPeer?: boolean; sampleLimit?: number },
): Promise<VaultMetadataReconcileResult> {
  const pullFromPeer = options?.pullFromPeer !== false;
  const sampleLimit = options?.sampleLimit ?? 12;

  const rows = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.workspaceId, workspaceId),
        isNull(documents.deletedAt),
        eq(documents.kind, "document"),
      ),
    );

  const vaultRoot = await resolveVaultPath().catch(() => null);
  const peerByPath = new Map<string, { size: number; mtimeMs: number }>();
  if (pullFromPeer && getCoreReplicationConfig()?.role === "local") {
    const config = getCoreReplicationConfig();
    if (config) {
      try {
        const response = await fetch(
          `${config.peerUrl}/internal/core-replication/vault/manifest`,
          {
            headers: { Authorization: `Bearer ${config.secret}` },
          },
        );
        if (response.ok) {
          const body = (await response.json()) as {
            files?: Array<{
              relativePath: string;
              size: number;
              mtimeMs: number;
            }>;
          };
          for (const file of body.files ?? []) {
            peerByPath.set(file.relativePath, {
              size: file.size,
              mtimeMs: file.mtimeMs,
            });
          }
        }
      } catch {
        // peer unreachable — still reconcile from local disk
      }
    }
  }

  let localByPath = new Map<string, { size: number; mtimeMs: number }>();
  if (vaultRoot) {
    const localFiles = await listMarkdownFiles(vaultRoot);
    localByPath = new Map(
      localFiles.map((f) => [f.relativePath, f] as const),
    );
  }

  const result: VaultMetadataReconcileResult = {
    scanned: rows.length,
    metadataUpdated: 0,
    pulledFromPeer: 0,
    staleZeroMetadata: 0,
    missingFileWithBytes: 0,
    samples: [],
  };

  for (const row of rows) {
    const storageKey = row.storageKey.replace(/\\/g, "/");
    const local = localByPath.get(storageKey);
    const peer = peerByPath.get(storageKey);

    let issue: string | null = null;

    if (row.byteSize === 0 && (local?.size ?? 0) > 0) {
      issue = "stale_zero_metadata_local_file";
      result.staleZeroMetadata += 1;
    } else if (row.byteSize === 0 && (peer?.size ?? 0) > 0) {
      issue = "stale_zero_metadata_peer_file";
      result.staleZeroMetadata += 1;
    } else if (row.byteSize > 0 && !local) {
      issue = "missing_file_with_bytes";
      result.missingFileWithBytes += 1;
    } else if (
      row.byteSize > 0 &&
      local &&
      local.size === 0
    ) {
      issue = "empty_file_with_bytes";
      result.missingFileWithBytes += 1;
    } else if (
      row.byteSize > 0 &&
      local &&
      local.size > 0 &&
      local.size !== row.byteSize
    ) {
      issue = "size_mismatch";
    }

    const needsPeerPull =
      pullFromPeer &&
      issue !== null &&
      getCoreReplicationConfig()?.role === "local" &&
      peer &&
      peer.size > 0 &&
      (!local || local.size === 0 || peer.size > local.size);

    if (needsPeerPull) {
      const pulled = await pullVaultMarkdownFromPeer(storageKey);
      if (pulled) {
        result.pulledFromPeer += 1;
        const refreshed = await listMarkdownFiles(vaultRoot!);
        localByPath = new Map(
          refreshed.map((f) => [f.relativePath, f] as const),
        );
      }
    }

    const syncResult = await syncDocumentMetadataFromStorageKey(
      workspaceId,
      storageKey,
    );
    if (syncResult === "updated") {
      result.metadataUpdated += 1;
    }

    if (issue && result.samples.length < sampleLimit) {
      result.samples.push({
        path: row.path,
        storageKey,
        issue,
      });
    }
  }

  return result;
}

/** After vault replication writes a file, refresh the matching document row. */
export async function syncDocumentMetadataAfterVaultWrite(
  relativePath: string,
): Promise<void> {
  const workspaceId = replicationWorkspaceId();
  if (!workspaceId) return;
  const storageKey = relativePath.replace(/\\/g, "/");
  await syncDocumentMetadataFromStorageKey(workspaceId, storageKey);
}

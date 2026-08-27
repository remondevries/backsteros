import { useCallback } from "react";
import type { Document as ApiDocument } from "@backsteros/contracts";
import type { BacksterosApiClient } from "@backsteros/api-client";

import { writeDocumentContentCache } from "../document-content-cache";
import type { SoftDeletableTable } from "./use-entity-patching";
import { shouldSkipRestEntityWrite } from "./powersync-write-path";
import type { WorkspacePowerSync } from "./workspace-data-types";

async function flushPowerSyncMetadataUpload(
  powerSync: WorkspacePowerSync,
): Promise<void> {
  const database = powerSync.database;
  if (!database) {
    throw new Error("PowerSync is not ready");
  }
  await database.uploadCrud();
}

async function commitInitialDocumentContent(
  client: BacksterosApiClient,
  documentId: string,
  content: string,
  ifMatchVersion: number,
): Promise<number> {
  const data = await client.requestJson<{
    content: string;
    contentVersion: number;
  }>(`/api/v1/documents/${encodeURIComponent(documentId)}/content`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content, ifMatchVersion }),
  });
  writeDocumentContentCache(documentId, {
    content: data.content,
    contentVersion: data.contentVersion,
  });
  return data.contentVersion;
}

/** Document / folder CRUD, moves, reordering, and icon updates. */
export function useWorkspaceDocumentActions({
  authenticated,
  client,
  powerSync,
  toSnakeFields,
  seedDocumentLocal,
  patchViaPowerSyncOrApi,
  softDeleteViaPowerSyncOrApi,
  setApiDocuments,
}: {
  authenticated: boolean;
  client: BacksterosApiClient;
  powerSync: WorkspacePowerSync;
  toSnakeFields: (values: Record<string, unknown>) => Record<string, unknown>;
  seedDocumentLocal: (document: ApiDocument) => Promise<void>;
  patchViaPowerSyncOrApi: (
    table: string,
    id: string,
    values: Record<string, unknown>,
  ) => Promise<{ number?: number } | void>;
  softDeleteViaPowerSyncOrApi: (
    table: SoftDeletableTable,
    id: string,
  ) => Promise<void>;
  setApiDocuments: (
    updater: (rows: ApiDocument[] | null) => ApiDocument[] | null,
  ) => void;
}) {
  const upsertOptimisticDocument = useCallback(
    (document: ApiDocument) => {
      setApiDocuments((rows) => {
        const next = rows ? [...rows] : [];
        const index = next.findIndex((entry) => entry.id === document.id);
        if (index >= 0) {
          next[index] = document;
          return next;
        }
        next.push(document);
        return next;
      });
    },
    [setApiDocuments],
  );

  const createDocumentMetadataLocal = useCallback(
    async (input: {
      type: "knowledge" | "project";
      title: string;
      path: string;
      projectId?: string | null;
      parentId?: string | null;
      kind?: "document" | "folder";
      content?: string;
    }) => {
      if (!powerSync.createMetadata) {
        throw new Error("PowerSync is not ready");
      }
      const id = crypto.randomUUID().replace(/-/g, "");
      const now = new Date().toISOString();
      const document = {
        id,
        type: input.type,
        projectId: input.projectId ?? null,
        parentId: input.parentId ?? null,
        kind: input.kind ?? "document",
        icon: null,
        sortOrder: 0,
        journalDate: null,
        path: input.path,
        title: input.title,
        storageKey: "",
        contentType: "text/markdown",
        byteSize: 0,
        checksum: null,
        snippet: null,
        contentVersion: 1,
        contentEtag: null,
        createdAt: now,
        updatedAt: now,
      } as ApiDocument;
      upsertOptimisticDocument(document);
      void (async () => {
        try {
          await powerSync.createMetadata!(
            "documents",
            toSnakeFields({
              type: input.type,
              projectId: input.projectId ?? null,
              parentId: input.parentId ?? null,
              kind: input.kind ?? "document",
              icon: null,
              sortOrder: 0,
              journalDate: null,
              path: input.path,
              title: input.title,
              storageKey: "",
              contentType: "text/markdown",
              byteSize: 0,
              checksum: null,
              snippet: null,
              contentVersion: 1,
              contentEtag: null,
            }),
            id,
          );
          await flushPowerSyncMetadataUpload(powerSync);
          const content = input.content ?? "";
          if (content.length > 0) {
            const contentVersion = await commitInitialDocumentContent(
              client,
              id,
              content,
              1,
            );
            upsertOptimisticDocument({ ...document, contentVersion });
          }
        } catch (error) {
          console.warn("[desktop] local document create failed", error);
        }
      })();
      return { id, path: input.path, contentVersion: 1 };
    },
    [client, powerSync, toSnakeFields, upsertOptimisticDocument],
  );

  const createKnowledgeDocument = useCallback(
    async (input: {
      title: string;
      content?: string;
      folderPath?: string;
      parentId?: string | null;
    }) => {
      const title = input.title.trim() || "Untitled";
      const slug =
        title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "untitled";
      const folder = input.folderPath?.trim().replace(/^\/+|\/+$/g, "") ?? "";
      const path = folder ? `${folder}/${slug}.md` : `${slug}.md`;
      if (!authenticated) throw new Error("Sign in to create documents.");
      if (shouldSkipRestEntityWrite(powerSync)) {
        return createDocumentMetadataLocal({
          type: "knowledge",
          title,
          path,
          parentId: input.parentId ?? null,
          content: input.content,
        });
      }
      const document = await client.requestJson<ApiDocument>(
        "/api/v1/documents",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: "knowledge",
            title,
            path,
            content: input.content ?? "",
            parentId: input.parentId ?? undefined,
          }),
        },
      );
      await seedDocumentLocal(document);
      return {
        id: document.id,
        path: document.path,
        contentVersion: document.contentVersion,
      };
    },
    [
      authenticated,
      client,
      createDocumentMetadataLocal,
      powerSync,
      seedDocumentLocal,
    ],
  );

  const createProjectDocument = useCallback(
    async (input: {
      projectId: string;
      title: string;
      content?: string;
      folderPath?: string;
      parentId?: string | null;
    }) => {
      const title = input.title.trim() || "Untitled";
      const slug =
        title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "untitled";
      const folder = input.folderPath?.trim().replace(/^\/+|\/+$/g, "") ?? "";
      const path = folder ? `${folder}/${slug}.md` : `${slug}.md`;
      if (!authenticated) throw new Error("Sign in to create documents.");
      if (shouldSkipRestEntityWrite(powerSync)) {
        return createDocumentMetadataLocal({
          type: "project",
          title,
          path,
          projectId: input.projectId,
          parentId: input.parentId ?? null,
          content: input.content,
        });
      }
      const document = await client.requestJson<ApiDocument>(
        "/api/v1/documents",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: "project",
            projectId: input.projectId,
            title,
            path,
            content: input.content ?? "",
            parentId: input.parentId ?? undefined,
          }),
        },
      );
      await seedDocumentLocal(document);
      return {
        id: document.id,
        path: document.path,
        contentVersion: document.contentVersion,
      };
    },
    [
      authenticated,
      client,
      createDocumentMetadataLocal,
      powerSync,
      seedDocumentLocal,
    ],
  );

  const createKnowledgeFolder = useCallback(
    async (input: { title: string; parentId?: string | null }) => {
      const title = input.title.trim();
      if (!title) throw new Error("Folder name is required.");
      const stamp = Date.now().toString(36);
      const slug =
        title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "folder";
      const path = `${slug}-${stamp}`;
      if (!authenticated) throw new Error("Sign in to create folders.");
      if (shouldSkipRestEntityWrite(powerSync)) {
        const created = await createDocumentMetadataLocal({
          type: "knowledge",
          title,
          path,
          parentId: input.parentId ?? null,
          kind: "folder",
        });
        return { id: created.id, path: created.path };
      }
      const document = await client.requestJson<ApiDocument>(
        "/api/v1/documents",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: "knowledge",
            kind: "folder",
            title,
            path,
            parentId: input.parentId ?? undefined,
          }),
        },
      );
      await seedDocumentLocal(document);
      return { id: document.id, path: document.path };
    },
    [
      authenticated,
      client,
      createDocumentMetadataLocal,
      powerSync,
      seedDocumentLocal,
    ],
  );

  const createProjectFolder = useCallback(
    async (input: {
      projectId: string;
      title: string;
      parentId?: string | null;
    }) => {
      const title = input.title.trim();
      if (!title) throw new Error("Folder name is required.");
      const stamp = Date.now().toString(36);
      const slug =
        title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "folder";
      const path = `${slug}-${stamp}`;
      if (!authenticated) throw new Error("Sign in to create folders.");
      if (shouldSkipRestEntityWrite(powerSync)) {
        const created = await createDocumentMetadataLocal({
          type: "project",
          title,
          path,
          projectId: input.projectId,
          parentId: input.parentId ?? null,
          kind: "folder",
        });
        return { id: created.id, path: created.path };
      }
      const document = await client.requestJson<ApiDocument>(
        "/api/v1/documents",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: "project",
            projectId: input.projectId,
            kind: "folder",
            title,
            path,
            parentId: input.parentId ?? undefined,
          }),
        },
      );
      await seedDocumentLocal(document);
      return { id: document.id, path: document.path };
    },
    [
      authenticated,
      client,
      createDocumentMetadataLocal,
      powerSync,
      seedDocumentLocal,
    ],
  );

  const renameDocument = useCallback(
    async (id: string, title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return { ok: false as const, error: "Title is required." };
      try {
        await patchViaPowerSyncOrApi("documents", id, { title: trimmed });
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          error:
            error instanceof Error ? error.message : "Could not rename.",
        };
      }
    },
    [patchViaPowerSyncOrApi],
  );

  const updateDocumentIcon = useCallback(
    async (id: string, icon: string | null) => {
      try {
        await patchViaPowerSyncOrApi("documents", id, { icon });
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          error:
            error instanceof Error
              ? error.message
              : "Could not update document icon.",
        };
      }
    },
    [patchViaPowerSyncOrApi],
  );

  const moveDocument = useCallback(
    async (id: string, parentId: string | null) => {
      try {
        if (powerSync.ready && powerSync.patchMetadata) {
          await powerSync.patchMetadata("documents", id, {
            parent_id: parentId,
          });
          if (shouldSkipRestEntityWrite(powerSync)) {
            return { ok: true as const };
          }
        }
        if (!authenticated) {
          return { ok: false as const, error: "Sign in to move documents." };
        }
        await client.requestJson(
          `/api/v1/documents/${encodeURIComponent(id)}/move`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ parentId }),
          },
        );
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : "Could not move.",
        };
      }
    },
    [authenticated, client, powerSync],
  );

  const reorderDocuments = useCallback(
    async (orderedIds: string[]) => {
      if (orderedIds.length === 0) {
        return {
          ok: false as const,
          error: "At least one document is required.",
        };
      }
      try {
        if (powerSync.ready && powerSync.patchMetadata) {
          await Promise.all(
            orderedIds.map((id, index) =>
              powerSync.patchMetadata!("documents", id, {
                sort_order: index,
              }),
            ),
          );
          if (shouldSkipRestEntityWrite(powerSync)) {
            return { ok: true as const };
          }
        }
        if (!authenticated) {
          return {
            ok: false as const,
            error: "Sign in to reorder documents.",
          };
        }
        await client.requestJson("/api/v1/documents/reorder", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderedIds }),
        });
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          error:
            error instanceof Error
              ? error.message
              : "Could not reorder documents.",
        };
      }
    },
    [authenticated, client, powerSync],
  );

  const deleteDocument = useCallback(
    async (id: string) => {
      try {
        await softDeleteViaPowerSyncOrApi("documents", id);
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : "Could not delete.",
        };
      }
    },
    [softDeleteViaPowerSyncOrApi],
  );

  return {
    createKnowledgeDocument,
    createProjectDocument,
    createKnowledgeFolder,
    createProjectFolder,
    renameDocument,
    updateDocumentIcon,
    moveDocument,
    reorderDocuments,
    deleteDocument,
  };
}

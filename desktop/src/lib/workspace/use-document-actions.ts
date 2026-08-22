import { useCallback } from "react";
import type { Document as ApiDocument } from "@backsteros/contracts";
import type { BacksterosApiClient } from "@backsteros/api-client";

import type { SoftDeletableTable } from "./use-entity-patching";
import type { WorkspacePowerSync } from "./workspace-data-types";

/** Document / folder CRUD, moves, reordering, and icon updates. */
export function useWorkspaceDocumentActions({
  authenticated,
  client,
  powerSync,
  seedDocumentLocal,
  patchViaPowerSyncOrApi,
  softDeleteViaPowerSyncOrApi,
}: {
  authenticated: boolean;
  client: BacksterosApiClient;
  powerSync: WorkspacePowerSync;
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
}) {
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
    [authenticated, client, seedDocumentLocal],
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
    [authenticated, client, seedDocumentLocal],
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
    [authenticated, client, seedDocumentLocal],
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
    [authenticated, client, seedDocumentLocal],
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
          return { ok: true as const };
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
          return { ok: true as const };
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

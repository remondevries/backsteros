"use client";

import type { Document as ApiDocument } from "@backsteros/contracts";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { AddFolderInline } from "@/components/documents/add-folder-inline";
import { DocumentTreeNodeView } from "@/components/documents/document-tree";
import { FolderPlusIcon } from "@/components/documents/folder-plus-icon";
import { KnowledgeSidePanelSkeleton } from "@/components/knowledge/knowledge-detail-skeleton";
import { ContentSidePanelHeader } from "@/components/shell/content-side-panel-header";
import { ContentSidePanelList } from "@/components/shell/content-side-panel-list";
import { SidePanelPlusIcon } from "@/components/shell/side-panel-plus-icon";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "@/components/shortcuts/list-keyboard-navigation-provider";
import { useApiResource, useAppApi } from "@/lib/api-context";
import {
  createKnowledgeFolderAction,
  deleteDocumentEntryAction,
  moveDocumentEntryAction,
  renameDocumentEntryAction,
  reorderDocumentEntriesAction,
} from "@/lib/mutations/documents";
import {
  getKnowledgeDocumentHref,
  getSelectedKnowledgeDocumentPathFromPathname,
} from "@/lib/knowledge/navigation-path";
import {
  buildDocumentTree,
  countDocumentTreeFolderItems,
  findDocumentIdByPath,
  findDocumentTreeNodeById,
  flattenVisibleDocumentTreeNavItemIds,
  formatFolderDeleteConfirmLabel,
  parseFolderNavId,
} from "@/lib/documents/tree";
import { usePowerSyncQuery } from "@/lib/powersync-context";
import { mergeLocalAndApiByUpdatedAt } from "@/lib/sync/prefer-local-or-api";
import { getFocusedListKeyboardItemId } from "@/lib/shortcuts/focused-list-keyboard-item";
import { registerDocumentTreeDeleteResolver } from "@/lib/shortcuts/document-tree-delete-shortcut";
import { registerDocumentTreeCreateFolderHandler } from "@/lib/shortcuts/document-tree-create-folder-shortcut";
import { DOCUMENT_TREE_CREATE_FOLDER_SHORTCUT_HINT } from "@/lib/shortcuts/should-handle-document-tree-create-folder-shortcut";
import { LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL } from "@/lib/shortcuts/list-keyboard-nav-zone";
import {
  isTreeDragActive,
  readTreeDragPayload,
  type TreeReorderRequest,
} from "@/components/documents/document-tree-drag";
import type { TreeDragPayload } from "@/lib/documents/tree-order-shared";

function snakeRow(row: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      value;
  }
  return output;
}

export function KnowledgeSidePanel({ pathname }: { pathname: string }) {
  const router = useRouter();
  const { client } = useAppApi();
  const listRef = useRef<HTMLElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  );
  const [isCreating, startCreateTransition] = useTransition();
  const [addingFolder, setAddingFolder] = useState(false);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [dragInsertBeforeId, setDragInsertBeforeId] = useState<string | null>(null);
  const [dragIntoFolderId, setDragIntoFolderId] = useState<string | null>(null);
  const [activeDragPayload, setActiveDragPayload] =
    useState<TreeDragPayload | null>(null);
  const selectedPath = getSelectedKnowledgeDocumentPathFromPathname(pathname);

  const resource = useApiResource<{ documents: ApiDocument[] }>((client) =>
    client.requestJson("/api/v1/documents?type=knowledge"),
  );
  const local = usePowerSyncQuery<Record<string, unknown>>(
    "SELECT * FROM documents WHERE deleted_at IS NULL AND type = 'knowledge' ORDER BY sort_order, path, updated_at DESC",
  );

  const documents = useMemo(() => {
    return mergeLocalAndApiByUpdatedAt(
      local.data?.map((row) => snakeRow(row) as ApiDocument),
      resource.data?.documents,
    );
  }, [local.data, resource.data]);

  const tree = useMemo(() => buildDocumentTree(documents), [documents]);

  const itemIds = useMemo(
    () => flattenVisibleDocumentTreeNavItemIds(tree, collapsedFolderIds),
    [tree, collapsedFolderIds],
  );

  const selectedDocumentId = useMemo(() => {
    if (!selectedPath) return null;
    return findDocumentIdByPath(tree, selectedPath);
  }, [tree, selectedPath]);

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId: selectedDocumentId,
    onNavigate: (itemId) => {
      const folderId = parseFolderNavId(itemId);
      if (folderId !== null) {
        setSelectedFolderId(folderId);
        setCollapsedFolderIds((current) => {
          const next = new Set(current);
          if (next.has(folderId)) next.delete(folderId);
          else next.add(folderId);
          return next;
        });
        return;
      }
      const document = documents.find((entry) => entry.id === itemId);
      if (!document) return;
      const href = getKnowledgeDocumentHref(document.path || document.id);
      if (href !== pathname) {
        router.push(href);
      }
    },
    zone: LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
    enabled: itemIds.length > 0,
  });

  const handleToggleFolderCollapsed = useCallback((folderId: string) => {
    setCollapsedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  const handleCreateDocument = useCallback(() => {
    startCreateTransition(async () => {
      const stamp = Date.now().toString(36);
      const path = `untitled-${stamp}.md`;
      try {
        const created = await client.requestJson<ApiDocument>("/api/v1/documents", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: "knowledge",
            title: "Untitled",
            path,
            content: "",
            parentId: selectedFolderId ?? undefined,
          }),
        });
        resource.reload();
        router.push(getKnowledgeDocumentHref(created.path || created.id));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not create document.");
      }
    });
  }, [client, resource, router, selectedFolderId]);

  const handleRename = useCallback(
    async (id: string, title: string) => {
      const result = await renameDocumentEntryAction({ id, title });
      if (result.ok) resource.reload();
      return result;
    },
    [resource],
  );

  useEffect(() => {
    return registerDocumentTreeCreateFolderHandler(() => {
      if (addingFolder) return false;
      setAddingFolder(true);
      return true;
    });
  }, [addingFolder]);

  useEffect(() => {
    return registerDocumentTreeDeleteResolver(() => {
      const focusedItemId = getFocusedListKeyboardItemId();
      if (!focusedItemId) {
        return null;
      }

      const folderId = parseFolderNavId(focusedItemId);
      if (folderId === null) {
        return null;
      }

      const node = findDocumentTreeNodeById(tree, folderId);
      if (!node || node.type !== "folder") {
        return null;
      }

      const itemCount = countDocumentTreeFolderItems(node);

      return {
        entityLabel: `folder "${node.title}"`,
        confirmLabel: formatFolderDeleteConfirmLabel(itemCount),
        onDelete: async () => {
          const result = await deleteDocumentEntryAction({ id: folderId });
          if (!result.ok) {
            return result;
          }
          resource.reload();
          return { ok: true as const };
        },
      };
    });
  }, [resource, tree]);

  const handleTreeDragEnd = useCallback(() => {
    setActiveDragPayload(null);
    setDragInsertBeforeId(null);
    setDragIntoFolderId(null);
  }, []);

  const handleReorderTreeItem = useCallback(
    (request: TreeReorderRequest) => {
      handleTreeDragEnd();

      void (async () => {
        const result =
          request.fromParentId !== request.toParentId
            ? await moveDocumentEntryAction({
                id: request.itemId,
                parentId: request.toParentId,
              })
            : await reorderDocumentEntriesAction({
                orderedIds: (() => {
                  const parent =
                    request.toParentId === null
                      ? null
                      : findDocumentTreeNodeById(tree, request.toParentId);
                  const siblings =
                    parent === null
                      ? tree
                      : parent.type === "folder"
                        ? parent.children
                        : [];
                  const ids = siblings
                    .filter((node) => node.id !== request.itemId)
                    .map((node) => node.id);
                  const insertAt = request.beforeId
                    ? ids.indexOf(request.beforeId)
                    : -1;
                  if (insertAt === -1) ids.push(request.itemId);
                  else ids.splice(insertAt, 0, request.itemId);
                  return ids;
                })(),
              });

        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        resource.reload();
      })();
    },
    [handleTreeDragEnd, resource, tree],
  );

  return (
    <div className="app-content-side-panel app-content-side-panel--documents flex h-full min-h-0 flex-col">
      <ContentSidePanelHeader
        title="Knowledge Base"
        actions={
          <>
            <button
              type="button"
              onClick={handleCreateDocument}
              disabled={isCreating}
              className="app-side-panel-section-action"
              aria-label="Create document"
            >
              <SidePanelPlusIcon />
            </button>
            <button
              type="button"
              onClick={() => setAddingFolder(true)}
              className="app-side-panel-section-action"
              aria-label={`Create folder (${DOCUMENT_TREE_CREATE_FOLDER_SHORTCUT_HINT})`}
              title={`Create folder (${DOCUMENT_TREE_CREATE_FOLDER_SHORTCUT_HINT})`}
            >
              <FolderPlusIcon className="size-3.5 text-current" />
            </button>
          </>
        }
      />
      <div className="app-content-side-panel-main flex min-h-0 flex-1 flex-col">
        {addingFolder ? (
          <div className="app-content-side-panel-inline">
            <AddFolderInline
              onCancel={() => setAddingFolder(false)}
              onSubmit={async (name) => {
                const result = await createKnowledgeFolderAction({
                  title: name,
                  parentId: selectedFolderId,
                });
                if (result.ok) resource.reload();
                return result.ok ? { ok: true } : { ok: false, error: result.error };
              }}
            />
          </div>
        ) : null}
        {resource.loading && !local.data && !documents.length ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
            <KnowledgeSidePanelSkeleton />
          </div>
        ) : documents.length || addingFolder ? (
          <ContentSidePanelList
            ref={listRef}
            aria-label="Knowledge documents"
            {...listContainerProps}
            onDragLeave={(event) => {
              if (
                event.relatedTarget instanceof Node &&
                event.currentTarget.contains(event.relatedTarget)
              ) {
                return;
              }
              setDragInsertBeforeId(null);
              setDragIntoFolderId(null);
            }}
            onDragOver={(event) => {
              if (!isTreeDragActive(event.dataTransfer)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              event.preventDefault();
              const payload = readTreeDragPayload(event.dataTransfer);
              if (!payload || payload.type !== "document") return;
              handleReorderTreeItem({
                itemType: payload.type,
                itemId: payload.id,
                fromParentId: payload.parentId,
                toParentId: null,
                beforeId: null,
              });
            }}
          >
            {tree.map((node) => (
              <DocumentTreeNodeView
                key={node.id}
                node={node}
                depth={0}
                parentId={null}
                selectedPath={selectedPath}
                onSelectFolder={setSelectedFolderId}
                onClearSelectedFolder={() => setSelectedFolderId(null)}
                collapsedFolderIds={collapsedFolderIds}
                onToggleFolderCollapsed={handleToggleFolderCollapsed}
                highlightedNavItemId={highlightedId}
                getDocumentHref={(path) => getKnowledgeDocumentHref(path)}
                onRename={handleRename}
                dragInsertBeforeId={dragInsertBeforeId}
                dragIntoFolderId={dragIntoFolderId}
                activeDragPayload={activeDragPayload}
                onDragInsertBeforeId={setDragInsertBeforeId}
                onDragIntoFolderId={setDragIntoFolderId}
                onTreeDragStart={setActiveDragPayload}
                onTreeDragEnd={handleTreeDragEnd}
                onReorderTreeItem={handleReorderTreeItem}
              />
            ))}
          </ContentSidePanelList>
        ) : null}
      </div>
    </div>
  );
}

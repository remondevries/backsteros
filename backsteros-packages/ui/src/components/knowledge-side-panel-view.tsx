"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";

import {
  getKnowledgeHref,
  getSelectedKnowledgeSlugFromPathname,
  type KnowledgeListItem,
} from "../entity-routes.js";
import {
  buildDocumentTree,
  countDocumentTreeFolderItems,
  findDocumentTreeNodeById,
  flattenVisibleDocumentTreeNavItemIds,
  formatFolderDeleteConfirmLabel,
  parseFolderNavId,
} from "../document-tree.js";
import { registerDocumentTreeCreateFolderHandler } from "../document-tree-create-folder-shortcut.js";
import { registerDocumentTreeDeleteResolver } from "../document-tree-delete-shortcut.js";
import type { TreeReorderRequest } from "../document-tree-drag.js";
import type { TreeDragPayload } from "../document-tree-order.js";
import { getFocusedListKeyboardItemId } from "../focused-list-keyboard-item.js";
import { DOCUMENT_TREE_CREATE_FOLDER_SHORTCUT_HINT } from "../should-handle-document-tree-create-folder-shortcut.js";
import { AddFolderInline } from "./add-folder-inline.js";
import { ContentSidePanelHeader } from "./content-side-panel-header.js";
import {
  ContentSidePanelEmpty,
  ContentSidePanelList,
} from "./content-side-panel-list.js";
import { DocumentTreeNodeView } from "./document-tree.js";
import { FolderPlusIcon } from "./folder-plus-icon.js";
import { SidePanelPlusIcon } from "./side-panel-plus-icon.js";
import { KnowledgeSidePanelSkeleton } from "./skeletons/knowledge-detail-skeleton.js";

export type KnowledgeSidePanelLinkComponent = ComponentType<{
  to: string;
  className?: string;
  "aria-current"?: "page";
  children: ReactNode;
  [key: string]: unknown;
}>;

export type KnowledgeSidePanelMutationResult =
  | { ok: true }
  | { ok: false; error: string };

export type KnowledgeSidePanelViewProps = {
  pathname: string;
  items: KnowledgeListItem[];
  Link: KnowledgeSidePanelLinkComponent;
  /** Create a document under the selected folder (or root). */
  onAdd?: (parentFolderId: string | null) => void;
  onCreateFolder?: (input: {
    title: string;
    parentId: string | null;
  }) => Promise<KnowledgeSidePanelMutationResult>;
  onRename?: (
    id: string,
    title: string,
  ) => Promise<KnowledgeSidePanelMutationResult>;
  onDelete?: (
    id: string,
  ) => Promise<KnowledgeSidePanelMutationResult>;
  onReorderTreeItem?: (request: TreeReorderRequest) => void;
  highlightedId?: string | null;
  listRef?: Ref<HTMLElement>;
  listContainerProps?: HTMLAttributes<HTMLElement>;
  /** Visible keyboard-nav ids (documents + `folder:` ids). */
  onVisibleNavItemIdsChange?: (ids: string[]) => void;
  /** Activate a folder from external keyboard navigation. */
  onFolderActivateRef?: Ref<(folderId: string) => void>;
  /** Show tree skeleton while workspace metadata is loading. */
  loading?: boolean;
};

function toTreeSource(item: KnowledgeListItem) {
  return {
    id: item.id,
    title: item.title,
    path: item.path ?? item.id,
    kind: item.kind === "folder" ? ("folder" as const) : ("document" as const),
    parentId: item.parentId ?? null,
    sortOrder: item.sortOrder ?? 0,
    icon: item.icon ?? null,
  };
}

export function KnowledgeSidePanelView({
  pathname,
  items,
  Link,
  onAdd,
  onCreateFolder,
  onRename,
  onDelete,
  onReorderTreeItem,
  highlightedId = null,
  listRef,
  listContainerProps,
  onVisibleNavItemIdsChange,
  onFolderActivateRef,
  loading = false,
}: KnowledgeSidePanelViewProps) {
  const selectedSlug = getSelectedKnowledgeSlugFromPathname(pathname);
  const [addingFolder, setAddingFolder] = useState(false);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [activeDragPayload, setActiveDragPayload] =
    useState<TreeDragPayload | null>(null);
  const [dragInsertBeforeId, setDragInsertBeforeId] = useState<string | null>(
    null,
  );
  const [dragIntoFolderId, setDragIntoFolderId] = useState<string | null>(null);

  const tree = useMemo(
    () => buildDocumentTree(items.map(toTreeSource)),
    [items],
  );

  const selectedPath = useMemo(() => {
    if (!selectedSlug) return null;
    const match = items.find(
      (item) =>
        selectedSlug === item.id ||
        selectedSlug === item.path ||
        selectedSlug === (item.path ?? item.id),
    );
    return match?.path ?? selectedSlug;
  }, [items, selectedSlug]);

  const visibleNavItemIds = useMemo(
    () => flattenVisibleDocumentTreeNavItemIds(tree, collapsedFolderIds),
    [tree, collapsedFolderIds],
  );

  useEffect(() => {
    onVisibleNavItemIdsChange?.(visibleNavItemIds);
  }, [onVisibleNavItemIdsChange, visibleNavItemIds]);

  const handleToggleFolderCollapsed = useCallback((folderId: string) => {
    setCollapsedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  const activateFolder = useCallback(
    (folderId: string) => {
      setSelectedFolderId(folderId);
      handleToggleFolderCollapsed(folderId);
    },
    [handleToggleFolderCollapsed],
  );

  useEffect(() => {
    if (!onFolderActivateRef) return;
    if (typeof onFolderActivateRef === "function") {
      onFolderActivateRef(activateFolder);
      return;
    }
    onFolderActivateRef.current = activateFolder;
  }, [activateFolder, onFolderActivateRef]);

  useEffect(() => {
    return registerDocumentTreeCreateFolderHandler(() => {
      if (!onCreateFolder || addingFolder) return false;
      setAddingFolder(true);
      return true;
    });
  }, [addingFolder, onCreateFolder]);

  useEffect(() => {
    if (!onDelete) return;
    return registerDocumentTreeDeleteResolver(() => {
      const focusedItemId = getFocusedListKeyboardItemId();
      if (!focusedItemId) return null;

      const folderId = parseFolderNavId(focusedItemId);
      if (folderId === null) return null;

      const node = findDocumentTreeNodeById(tree, folderId);
      if (!node || node.type !== "folder") return null;

      const itemCount = countDocumentTreeFolderItems(node);

      return {
        entityLabel: `folder "${node.title}"`,
        confirmLabel: formatFolderDeleteConfirmLabel(itemCount),
        onDelete: async () => {
          const result = await onDelete(folderId);
          if (!result.ok) return result;
          return { ok: true as const };
        },
      };
    });
  }, [onDelete, tree]);

  const handleTreeDragEnd = useCallback(() => {
    setActiveDragPayload(null);
    setDragInsertBeforeId(null);
    setDragIntoFolderId(null);
  }, []);

  const handleReorderTreeItem = useCallback(
    (request: TreeReorderRequest) => {
      handleTreeDragEnd();
      onReorderTreeItem?.(request);
    },
    [handleTreeDragEnd, onReorderTreeItem],
  );

  const showList = items.length > 0 || addingFolder;
  const showLoadingSkeleton = loading && items.length === 0 && !addingFolder;

  return (
    <div className="app-content-side-panel app-content-side-panel--documents">
      <ContentSidePanelHeader
        title="Knowledge Base"
        actions={
          <>
            {onAdd ? (
              <button
                type="button"
                className="app-side-panel-section-action"
                aria-label="Create document"
                onClick={() => onAdd(selectedFolderId)}
              >
                <SidePanelPlusIcon />
              </button>
            ) : null}
            {onCreateFolder ? (
              <button
                type="button"
                className="app-side-panel-section-action"
                aria-label={`Create folder (${DOCUMENT_TREE_CREATE_FOLDER_SHORTCUT_HINT})`}
                title={`Create folder (${DOCUMENT_TREE_CREATE_FOLDER_SHORTCUT_HINT})`}
                onClick={() => setAddingFolder(true)}
              >
                <FolderPlusIcon className="size-3.5" />
              </button>
            ) : null}
          </>
        }
      />
      <div className="app-content-side-panel-main">
        {addingFolder && onCreateFolder ? (
          <div className="app-content-side-panel-inline">
            <AddFolderInline
              onCancel={() => setAddingFolder(false)}
              onSubmit={async (name) =>
                onCreateFolder({ title: name, parentId: selectedFolderId })
              }
            />
          </div>
        ) : null}
        {!showList ? (
          showLoadingSkeleton ? (
            <KnowledgeSidePanelSkeleton />
          ) : (
            <ContentSidePanelEmpty>
              No documents yet. Use the plus button to add one.
            </ContentSidePanelEmpty>
          )
        ) : (
          <ContentSidePanelList
            aria-label="Knowledge documents"
            ref={listRef}
            {...listContainerProps}
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
                getDocumentHref={(path) => getKnowledgeHref(path)}
                Link={Link}
                onRename={onRename}
                dragInsertBeforeId={dragInsertBeforeId}
                dragIntoFolderId={dragIntoFolderId}
                activeDragPayload={activeDragPayload}
                onDragInsertBeforeId={setDragInsertBeforeId}
                onDragIntoFolderId={setDragIntoFolderId}
                onTreeDragStart={setActiveDragPayload}
                onTreeDragEnd={handleTreeDragEnd}
                onReorderTreeItem={
                  onReorderTreeItem ? handleReorderTreeItem : undefined
                }
              />
            ))}
          </ContentSidePanelList>
        )}
      </div>
    </div>
  );
}

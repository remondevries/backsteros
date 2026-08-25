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

import type { KnowledgeListItem } from "../../navigation/entity-routes.js";
import {
  buildDocumentTree,
  countDocumentTreeFolderItems,
  findDocumentTreeNodeById,
  flattenVisibleDocumentTreeNavItemIds,
  formatFolderDeleteConfirmLabel,
  parseFolderNavId,
} from "../../documents/document-tree.js";
import { registerDocumentTreeCreateFolderHandler } from "../../documents/document-tree-create-folder-shortcut.js";
import { registerDocumentTreeDeleteResolver } from "../../documents/document-tree-delete-shortcut.js";
import type { TreeReorderRequest } from "../../documents/document-tree-drag.js";
import type { TreeDragPayload } from "../../documents/document-tree-order.js";
import { getFocusedListKeyboardItemId } from "../../list-nav/focused-list-keyboard-item.js";
import { DOCUMENT_TREE_CREATE_FOLDER_SHORTCUT_HINT } from "../../documents/should-handle-document-tree-create-folder-shortcut.js";
import { AddFolderInline } from "./add-folder-inline.js";
import { ContentSidePanelShell } from "../content/content-side-panel-shell.js";
import { DocumentTreeNodeView } from "./document-tree.js";
import { FolderPlusIcon } from "../icons/folder-plus-icon.js";
import { SidePanelPlusIcon } from "../shell/side-panel-plus-icon.js";
import { SidePanelListSkeleton } from "../skeletons/side-panel-list-skeleton.js";

export type DocumentTreeSidePanelLinkComponent = ComponentType<{
  to: string;
  className?: string;
  "aria-current"?: "page";
  children: ReactNode;
  [key: string]: unknown;
}>;

export type DocumentTreeSidePanelMutationResult =
  | { ok: true }
  | { ok: false; error: string };

export type DocumentTreeSidePanelViewProps = {
  pathname: string;
  items: KnowledgeListItem[];
  Link: DocumentTreeSidePanelLinkComponent;
  title: string;
  listAriaLabel: string;
  emptyLabel?: ReactNode;
  /** Resolve selected path/slug from the current pathname. */
  getSelectedSlug: (pathname: string) => string | null;
  getDocumentHref: (pathOrId: string) => string;
  onAdd?: (parentFolderId: string | null) => void;
  onCreateFolder?: (input: {
    title: string;
    parentId: string | null;
  }) => Promise<DocumentTreeSidePanelMutationResult>;
  onRename?: (
    id: string,
    title: string,
  ) => Promise<DocumentTreeSidePanelMutationResult>;
  onDelete?: (
    id: string,
  ) => Promise<DocumentTreeSidePanelMutationResult>;
  onReorderTreeItem?: (request: TreeReorderRequest) => void;
  highlightedId?: string | null;
  listRef?: Ref<HTMLElement>;
  listContainerProps?: HTMLAttributes<HTMLElement>;
  onVisibleNavItemIdsChange?: (ids: string[]) => void;
  onFolderActivateRef?: Ref<(folderId: string) => void>;
  loading?: boolean;
  /**
   * `chrome` — app content side panel (default).
   * `embedded` — codebase workbench Docs tab (matches Files tree chrome).
   */
  variant?: "chrome" | "embedded";
  className?: string;
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

/**
 * Shared document/folder tree side panel used by Knowledge Base and project Documents.
 */
export function DocumentTreeSidePanelView({
  pathname,
  items,
  Link,
  title,
  listAriaLabel,
  emptyLabel = "No documents yet. Use the plus button to add one.",
  getSelectedSlug,
  getDocumentHref,
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
  variant = "chrome",
  className = "app-content-side-panel--documents",
}: DocumentTreeSidePanelViewProps) {
  const embedded = variant === "embedded";
  const selectedSlug = getSelectedSlug(pathname);
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

  const actions = (
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
  );

  const beforeBody =
    addingFolder && onCreateFolder ? (
      <div className="app-content-side-panel-inline">
        <AddFolderInline
          onCancel={() => setAddingFolder(false)}
          onSubmit={async (name) =>
            onCreateFolder({ title: name, parentId: selectedFolderId })
          }
        />
      </div>
    ) : null;

  const treeNodes = tree.map((node) => (
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
      getDocumentHref={getDocumentHref}
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
  ));

  if (embedded) {
    return (
      <div className="console-docs-tree">
        {onAdd || onCreateFolder ? (
          <div className="console-docs-tree__actions">{actions}</div>
        ) : null}
        <div className="console-docs-tree__main">
          {beforeBody}
          {!showList ? (
            <p className="app-content-side-panel-empty">{emptyLabel}</p>
          ) : (
            <nav
              ref={listRef}
              className="app-content-side-panel-body"
              aria-label={listAriaLabel}
              {...listContainerProps}
            >
              <ul className="app-content-side-panel-list">{treeNodes}</ul>
            </nav>
          )}
        </div>
      </div>
    );
  }

  return (
    <ContentSidePanelShell
      title={title}
      headerActions={actions}
      className={className}
      beforeBody={beforeBody}
      loading={showLoadingSkeleton}
      loadingSkeleton={
        <SidePanelListSkeleton
          rows={7}
          variant="tree"
          label={`Loading ${title.toLowerCase()}`}
        />
      }
      isEmpty={!showList}
      emptyLabel={emptyLabel}
      listAriaLabel={listAriaLabel}
      listRef={listRef}
      listContainerProps={listContainerProps}
    >
      {treeNodes}
    </ContentSidePanelShell>
  );
}

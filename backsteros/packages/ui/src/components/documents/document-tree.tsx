"use client";

import {
  memo,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { DocumentIcon } from "./document-icon.js";
import { keyboardNavItemProps } from "../../list-nav/keyboard-nav-item.js";
import { sidePanelItemClass } from "../../content/side-panel-styles.js";
import {
  folderNavId,
  type DocumentTreeDocumentNode,
  type DocumentTreeFolderNode,
  type DocumentTreeNode,
} from "../../documents/document-tree.js";
import {
  writeTreeDragPayload,
  isTreeDragActive,
  readTreeDragPayload,
  resolveFolderDragOverMode,
  resolveTreeDropAction,
  type TreeReorderRequest,
} from "../../documents/document-tree-drag.js";
import { registerDocumentTreeFolderRenameHandler } from "../../documents/document-tree-folder-rename-shortcut.js";
import {
  treeNodeOrderKey,
  type TreeDragPayload,
} from "../../documents/document-tree-order.js";
import { KebabHorizontalIcon } from "../contacts/relationship-label-overflow-menu.js";
import {
  HelpArticleIndividualListItemCard,
  type HelpArticleIndividualListContact,
} from "../spaces/help-article-individual-list-item-card.js";
import type { HelpArticleStatus } from "../../spaces/help-article-properties.js";
import { DocumentTreeFolderOverflowMenu } from "./document-tree-folder-overflow-menu.js";

export type DocumentTreeLinkComponent = ComponentType<{
  to: string;
  className?: string;
  title?: string;
  onClick?: () => void;
  onDoubleClick?: (event: MouseEvent) => void;
  children: ReactNode;
  [key: string]: unknown;
}>;

type RenameResult = { ok: true } | { ok: false; error: string };

export type DocumentTreeIndividualCardMeta = {
  status?: HelpArticleStatus | string | null;
  contacts?: readonly HelpArticleIndividualListContact[];
  appearsInLabel?: string | null;
};

type DocumentTreeSharedProps = {
  depth: number;
  parentId: string | null;
  selectedPath?: string | null;
  onClearSelectedFolder?: () => void;
  onSelectFolder?: (folderId: string) => void;
  /** Opens folder portal settings from the ⋯ → Settings action. */
  onConfigureFolder?: (folderId: string) => void;
  collapsedFolderIds: ReadonlySet<string>;
  onToggleFolderCollapsed: (folderId: string) => void;
  highlightedNavItemId?: string | null;
  getDocumentHref: (path: string) => string;
  Link: DocumentTreeLinkComponent;
  onRename?: (id: string, title: string) => Promise<RenameResult>;
  dragInsertBeforeId?: string | null;
  dragIntoFolderId?: string | null;
  activeDragPayload?: TreeDragPayload | null;
  onDragInsertBeforeId?: (id: string | null) => void;
  onDragIntoFolderId?: (id: string | null) => void;
  onTreeDragStart?: (payload: TreeDragPayload) => void;
  onTreeDragEnd?: () => void;
  onReorderTreeItem?: (request: TreeReorderRequest) => void;
  /**
   * Support Individual list: render document rows as inbox-style cards.
   * Folders stay as tree rows.
   */
  documentRowVariant?: "default" | "individual-card";
  individualCardMetaById?: ReadonlyMap<string, DocumentTreeIndividualCardMeta>;
};

/** Collapsed ids that affect this folder row or its mounted descendants. */
function collapsedSignatureForFolder(
  folder: DocumentTreeFolderNode,
  collapsedFolderIds: ReadonlySet<string>,
): string {
  const parts: string[] = [];
  function visit(node: DocumentTreeFolderNode) {
    if (collapsedFolderIds.has(node.id)) {
      parts.push(node.id);
      return;
    }
    for (const child of node.children) {
      if (child.type === "folder") visit(child);
    }
  }
  visit(folder);
  return parts.join("\0");
}

function sharedTreePropsEqual(
  prev: DocumentTreeSharedProps,
  next: DocumentTreeSharedProps,
): boolean {
  return (
    prev.depth === next.depth &&
    prev.parentId === next.parentId &&
    prev.selectedPath === next.selectedPath &&
    prev.onClearSelectedFolder === next.onClearSelectedFolder &&
    prev.onSelectFolder === next.onSelectFolder &&
    prev.onConfigureFolder === next.onConfigureFolder &&
    prev.onToggleFolderCollapsed === next.onToggleFolderCollapsed &&
    prev.highlightedNavItemId === next.highlightedNavItemId &&
    prev.getDocumentHref === next.getDocumentHref &&
    prev.Link === next.Link &&
    prev.onRename === next.onRename &&
    prev.dragInsertBeforeId === next.dragInsertBeforeId &&
    prev.dragIntoFolderId === next.dragIntoFolderId &&
    prev.activeDragPayload === next.activeDragPayload &&
    prev.onDragInsertBeforeId === next.onDragInsertBeforeId &&
    prev.onDragIntoFolderId === next.onDragIntoFolderId &&
    prev.onTreeDragStart === next.onTreeDragStart &&
    prev.onTreeDragEnd === next.onTreeDragEnd &&
    prev.onReorderTreeItem === next.onReorderTreeItem &&
    prev.documentRowVariant === next.documentRowVariant &&
    prev.individualCardMetaById === next.individualCardMetaById
  );
}

function TreeRenameForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  isPending,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isPending: boolean;
  ariaLabel: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <form
      className="app-side-panel-item-rename-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <input
        ref={inputRef}
        value={value}
        size={Math.max(1, value.length || 1)}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        onBlur={() => {
          if (!isPending) onSubmit();
        }}
        disabled={isPending}
        aria-label={ariaLabel}
        className="app-side-panel-item-rename-input"
      />
    </form>
  );
}

function TreeErrorText({ error }: { error: string }) {
  return (
    <p className="app-side-panel-tree-error" role="alert">
      {error}
    </p>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      width="12"
      height="12"
      aria-hidden="true"
      className="app-side-panel-tree-folder-chevron"
      data-expanded={expanded ? "true" : undefined}
    >
      <path
        d="M4 2.5L8 6L4 9.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

const DocumentTreeItem = memo(function DocumentTreeItem({
  document,
  depth,
  selectedPath,
  onClearSelectedFolder,
  highlightedNavItemId,
  getDocumentHref,
  Link,
  onRename,
  parentId,
  dragInsertBeforeId,
  onDragInsertBeforeId,
  onDragIntoFolderId,
  onTreeDragStart,
  onTreeDragEnd,
  onReorderTreeItem,
  documentRowVariant = "default",
  individualCardMetaById,
}: DocumentTreeSharedProps & { document: DocumentTreeDocumentNode }) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(document.title);
  const [optimisticTitle, setOptimisticTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const displayTitle = optimisticTitle ?? document.title;
  const isSelected = document.path === selectedPath;
  const isKeyboardHighlighted = highlightedNavItemId === document.id;
  const href = getDocumentHref(document.path);
  const paddingLeft = depth > 0 ? `${depth * 12}px` : undefined;
  const canDrag = Boolean(onReorderTreeItem);
  const showInsertIndicator =
    canDrag && dragInsertBeforeId === treeNodeOrderKey(document);
  const useIndividualCard = documentRowVariant === "individual-card";
  const cardMeta = individualCardMetaById?.get(document.id);

  useEffect(() => {
    if (optimisticTitle != null && document.title === optimisticTitle) {
      setOptimisticTitle(null);
    }
  }, [document.title, optimisticTitle]);

  function cancelRename() {
    setIsRenaming(false);
    setRenameValue(displayTitle);
    setError(null);
  }

  function submitRename() {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === displayTitle || !onRename) {
      cancelRename();
      return;
    }
    // Close the editor immediately so rename feels as snappy as other patches.
    setOptimisticTitle(trimmed);
    setIsRenaming(false);
    setError(null);
    void onRename(document.id, trimmed).then((result) => {
      if (!result.ok) {
        setOptimisticTitle(null);
        setError(result.error);
      }
    });
  }

  function handleDragStart(event: DragEvent<HTMLDivElement>) {
    if (!canDrag) return;
    const payload = {
      type: "document" as const,
      id: document.id,
      parentId,
    };
    writeTreeDragPayload(event.dataTransfer, document, parentId);
    event.dataTransfer.effectAllowed = "move";
    onTreeDragStart?.(payload);
  }

  function handleDragOver(event: DragEvent<HTMLLIElement>) {
    if (!canDrag || !isTreeDragActive(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    onDragIntoFolderId?.(null);
    onDragInsertBeforeId?.(document.id);
  }

  function handleDrop(event: DragEvent<HTMLLIElement>) {
    if (!canDrag) return;
    event.preventDefault();
    event.stopPropagation();
    onTreeDragEnd?.();
    const payload = readTreeDragPayload(event.dataTransfer);
    if (!payload) return;
    const action = resolveTreeDropAction({
      payload,
      targetNode: document,
      targetParentId: parentId,
    });
    if (action) onReorderTreeItem?.(action);
  }

  return (
    <li
      className={[
        "list-none",
        useIndividualCard ? "inbox-list-item" : null,
        showInsertIndicator ? "app-side-panel-tree-insert-before" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      onDragOver={canDrag ? handleDragOver : undefined}
      onDrop={canDrag ? handleDrop : undefined}
    >
      <div style={paddingLeft ? { paddingLeft } : undefined}>
        {useIndividualCard && !(isRenaming && onRename) ? (
          <div
            data-tauri-drag-region="false"
            draggable={canDrag}
            onDragStart={canDrag ? handleDragStart : undefined}
            onDragEnd={canDrag ? onTreeDragEnd : undefined}
            className={
              canDrag ? "app-side-panel-tree-draggable min-w-0" : "min-w-0"
            }
          >
            <HelpArticleIndividualListItemCard
              title={displayTitle}
              href={href}
              Link={Link}
              active={isSelected}
              keyboardHighlighted={isKeyboardHighlighted}
              itemId={document.id}
              status={cardMeta?.status}
              contacts={cardMeta?.contacts}
              appearsInLabel={cardMeta?.appearsInLabel}
              onActivate={() => onClearSelectedFolder?.()}
              onDoubleClickTitle={
                onRename
                  ? (event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setRenameValue(displayTitle);
                      setIsRenaming(true);
                      setError(null);
                    }
                  : undefined
              }
            />
          </div>
        ) : (
          <div
            data-tauri-drag-region="false"
            draggable={canDrag && !isRenaming}
            onDragStart={
              canDrag && !isRenaming ? handleDragStart : undefined
            }
            onDragEnd={canDrag && !isRenaming ? onTreeDragEnd : undefined}
            className={`${sidePanelItemClass({
              active: isSelected,
              keyboardHighlighted: isKeyboardHighlighted || isRenaming,
            })} min-w-0 ${canDrag && !isRenaming ? "app-side-panel-tree-draggable" : ""}`}
          >
            <span className="app-side-panel-item-icon" aria-hidden="true">
              <DocumentIcon size={14} className="shrink-0" />
            </span>
            {isRenaming && onRename ? (
              <TreeRenameForm
                value={renameValue}
                onChange={setRenameValue}
                onSubmit={submitRename}
                onCancel={cancelRename}
                isPending={false}
                ariaLabel="Rename document"
              />
            ) : (
              <Link
                to={href}
                onClick={() => onClearSelectedFolder?.()}
                onDoubleClick={
                  onRename
                    ? (event) => {
                        event.preventDefault();
                        setRenameValue(displayTitle);
                        setIsRenaming(true);
                        setError(null);
                      }
                    : undefined
                }
                className="app-side-panel-item-label min-w-0 flex-1 text-inherit no-underline"
                title={
                  onRename
                    ? canDrag
                      ? "Double-click to rename · Drag to reorder"
                      : "Double-click to rename"
                    : canDrag
                      ? "Drag to reorder"
                      : undefined
                }
                draggable={false}
                {...keyboardNavItemProps(document.id)}
              >
                {displayTitle}
              </Link>
            )}
          </div>
        )}
        {error ? <TreeErrorText error={error} /> : null}
      </div>
    </li>
  );
}, (prev, next) => {
  if (prev.document !== next.document) return false;
  // Document rows ignore collapsedFolderIds for their own paint.
  return sharedTreePropsEqual(prev, next);
});

const DocumentTreeFolder = memo(function DocumentTreeFolder({
  folder,
  depth,
  selectedPath,
  onClearSelectedFolder,
  onSelectFolder,
  onConfigureFolder,
  collapsedFolderIds,
  onToggleFolderCollapsed,
  highlightedNavItemId,
  getDocumentHref,
  Link,
  onRename,
  parentId,
  dragInsertBeforeId,
  dragIntoFolderId,
  activeDragPayload,
  onDragInsertBeforeId,
  onDragIntoFolderId,
  onTreeDragStart,
  onTreeDragEnd,
  onReorderTreeItem,
  documentRowVariant = "default",
  individualCardMetaById,
}: DocumentTreeSharedProps & { folder: DocumentTreeFolderNode }) {
  const collapsed = collapsedFolderIds.has(folder.id);
  const [isDragging, setIsDragging] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(folder.title);
  const [optimisticTitle, setOptimisticTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const displayTitle = optimisticTitle ?? folder.title;
  const navId = folderNavId(folder.id);
  const showFolderMenu = Boolean(onConfigureFolder || onRename);
  const isKeyboardHighlighted = highlightedNavItemId === navId;
  const paddingLeft = depth > 0 ? `${depth * 12}px` : undefined;
  const canDrag = Boolean(onReorderTreeItem);
  const showInsertIndicator =
    canDrag &&
    dragInsertBeforeId === treeNodeOrderKey(folder) &&
    dragIntoFolderId !== treeNodeOrderKey(folder);
  const showDropIntoHighlight =
    canDrag && dragIntoFolderId === treeNodeOrderKey(folder);

  useEffect(() => {
    if (optimisticTitle != null && folder.title === optimisticTitle) {
      setOptimisticTitle(null);
    }
  }, [folder.title, optimisticTitle]);

  useEffect(() => {
    if (!onRename || isRenaming) {
      return;
    }

    return registerDocumentTreeFolderRenameHandler((focusedItemId) => {
      if (focusedItemId !== navId) {
        return false;
      }
      setRenameValue(displayTitle);
      setIsRenaming(true);
      setError(null);
      return true;
    });
  }, [displayTitle, isRenaming, navId, onRename]);

  function cancelRename() {
    setIsRenaming(false);
    setRenameValue(displayTitle);
    setError(null);
  }

  function submitRename() {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === displayTitle || !onRename) {
      cancelRename();
      return;
    }
    // Close the editor immediately so rename feels as snappy as other patches.
    setOptimisticTitle(trimmed);
    setIsRenaming(false);
    setError(null);
    void onRename(folder.id, trimmed).then((result) => {
      if (!result.ok) {
        setOptimisticTitle(null);
        setError(result.error);
      }
    });
  }

  function handleDragStart(event: DragEvent<HTMLButtonElement>) {
    if (!canDrag) return;
    const payload = {
      type: "folder" as const,
      id: folder.id,
      parentId,
    };
    writeTreeDragPayload(event.dataTransfer, folder, parentId);
    event.dataTransfer.effectAllowed = "move";
    setIsDragging(true);
    onTreeDragStart?.(payload);
  }

  function handleDragEnd() {
    setIsDragging(false);
    onTreeDragEnd?.();
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!canDrag || !isTreeDragActive(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    const mode = resolveFolderDragOverMode(
      activeDragPayload ?? readTreeDragPayload(event.dataTransfer),
      folder.id,
      parentId,
    );
    if (mode === "into") {
      onDragIntoFolderId?.(folder.id);
    } else if (mode === "before") {
      onDragInsertBeforeId?.(folder.id);
    } else {
      onDragInsertBeforeId?.(null);
      onDragIntoFolderId?.(null);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (!canDrag) return;
    event.preventDefault();
    event.stopPropagation();
    onTreeDragEnd?.();
    const payload = readTreeDragPayload(event.dataTransfer);
    if (!payload) return;
    const action = resolveTreeDropAction({
      payload,
      targetNode: folder,
      targetParentId: parentId,
    });
    if (action) onReorderTreeItem?.(action);
  }

  return (
    <li
      className={[
        "list-none",
        showInsertIndicator ? "app-side-panel-tree-insert-before" : null,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className={[
          "app-side-panel-tree-folder-drop-target",
          showDropIntoHighlight
            ? "app-side-panel-tree-folder-drop-target--into"
            : null,
        ]
          .filter(Boolean)
          .join(" ")}
        style={paddingLeft ? { paddingLeft } : undefined}
        onDragOver={canDrag ? handleDragOver : undefined}
        onDrop={canDrag ? handleDrop : undefined}
      >
        {isRenaming && onRename ? (
          <div className="app-side-panel-tree-folder-row keyboard-nav-item-highlight">
            <span className="app-side-panel-item-icon shrink-0" aria-hidden="true">
              <ChevronIcon expanded={!collapsed} />
            </span>
            <TreeRenameForm
              value={renameValue}
              onChange={setRenameValue}
              onSubmit={submitRename}
              onCancel={cancelRename}
              isPending={false}
              ariaLabel="Rename folder"
            />
          </div>
        ) : (
          <div
            className={[
              "app-side-panel-tree-folder-row min-w-0",
              isKeyboardHighlighted && !showDropIntoHighlight
                ? "keyboard-nav-item-highlight"
                : null,
              menu ? "is-menu-open" : null,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <button
              type="button"
              data-tauri-drag-region="false"
              draggable={canDrag}
              onDragStart={canDrag ? handleDragStart : undefined}
              onDragEnd={canDrag ? handleDragEnd : undefined}
              onClick={() => {
                onToggleFolderCollapsed(folder.id);
                onSelectFolder?.(folder.id);
              }}
              onDoubleClick={
                onRename
                  ? (event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setMenu(null);
                      setRenameValue(displayTitle);
                      setIsRenaming(true);
                      setError(null);
                    }
                  : undefined
              }
              aria-expanded={!collapsed}
              className={[
                "app-side-panel-tree-folder-button",
                canDrag
                  ? isDragging
                    ? "app-side-panel-tree-draggable--dragging"
                    : "app-side-panel-tree-draggable"
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
              title={
                onRename
                  ? canDrag
                    ? "Click to expand or collapse · Double-click to rename · Drag to reorder · Drop documents to move into folder"
                    : "Click to expand or collapse · Double-click to rename"
                  : canDrag
                    ? "Click to expand or collapse · Drag to reorder · Drop documents to move into folder"
                    : "Click to expand or collapse"
              }
              {...keyboardNavItemProps(navId)}
            >
              <span className="app-side-panel-item-icon shrink-0" aria-hidden="true">
                <ChevronIcon expanded={!collapsed} />
              </span>
              <span className="app-side-panel-item-label min-w-0 flex-1 font-medium">
                {displayTitle}
              </span>
            </button>
            {showFolderMenu ? (
              <button
                type="button"
                className="app-side-panel-tree-folder-row__menu-trigger"
                aria-label={`Actions for ${displayTitle}`}
                aria-expanded={Boolean(menu)}
                aria-haspopup="menu"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const rect = event.currentTarget.getBoundingClientRect();
                  setMenu({
                    x: rect.right,
                    y: rect.bottom + 4,
                  });
                }}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <KebabHorizontalIcon />
              </button>
            ) : null}
          </div>
        )}
        {error ? <TreeErrorText error={error} /> : null}
        <DocumentTreeFolderOverflowMenu
          open={Boolean(menu)}
          x={menu?.x ?? 0}
          y={menu?.y ?? 0}
          folderTitle={displayTitle}
          onClose={() => setMenu(null)}
          onSettings={
            onConfigureFolder
              ? () => {
                  onConfigureFolder(folder.id);
                }
              : undefined
          }
          onRename={
            onRename
              ? () => {
                  setRenameValue(displayTitle);
                  setIsRenaming(true);
                  setError(null);
                }
              : undefined
          }
        />
      </div>

      {!collapsed ? (
        <ul className="app-side-panel-tree-children">
          {folder.children.map((child) => (
            <DocumentTreeNodeView
              key={child.id}
              node={child}
              depth={depth + 1}
              parentId={folder.id}
              selectedPath={selectedPath}
              onClearSelectedFolder={onClearSelectedFolder}
              onSelectFolder={onSelectFolder}
              onConfigureFolder={onConfigureFolder}
              collapsedFolderIds={collapsedFolderIds}
              onToggleFolderCollapsed={onToggleFolderCollapsed}
              highlightedNavItemId={highlightedNavItemId}
              getDocumentHref={getDocumentHref}
              Link={Link}
              onRename={onRename}
              dragInsertBeforeId={dragInsertBeforeId}
              dragIntoFolderId={dragIntoFolderId}
              activeDragPayload={activeDragPayload}
              onDragInsertBeforeId={onDragInsertBeforeId}
              onDragIntoFolderId={onDragIntoFolderId}
              onTreeDragStart={onTreeDragStart}
              onTreeDragEnd={onTreeDragEnd}
              onReorderTreeItem={onReorderTreeItem}
              documentRowVariant={documentRowVariant}
              individualCardMetaById={individualCardMetaById}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}, (prev, next) => {
  if (prev.folder !== next.folder) return false;
  if (!sharedTreePropsEqual(prev, next)) return false;
  return (
    collapsedSignatureForFolder(prev.folder, prev.collapsedFolderIds) ===
    collapsedSignatureForFolder(next.folder, next.collapsedFolderIds)
  );
});

export function DocumentTreeNodeView(
  props: DocumentTreeSharedProps & { node: DocumentTreeNode },
) {
  const { node, ...rest } = props;
  if (node.type === "folder") {
    return <DocumentTreeFolder folder={node} {...rest} />;
  }
  return <DocumentTreeItem document={node} {...rest} />;
}

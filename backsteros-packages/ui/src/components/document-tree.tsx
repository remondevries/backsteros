"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ComponentType,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { DocumentIcon } from "./document-icon.js";
import { keyboardNavItemProps } from "../keyboard-nav-item.js";
import { sidePanelItemClass } from "../side-panel-styles.js";
import {
  folderNavId,
  type DocumentTreeDocumentNode,
  type DocumentTreeFolderNode,
  type DocumentTreeNode,
} from "../document-tree.js";
import {
  createTreeDragPayload,
  DOCUMENT_TREE_DRAG_TYPE,
  isTreeDragActive,
  readTreeDragPayload,
  resolveFolderDragOverMode,
  resolveTreeDropAction,
  type TreeReorderRequest,
} from "../document-tree-drag.js";
import { registerDocumentTreeFolderRenameHandler } from "../document-tree-folder-rename-shortcut.js";
import {
  treeNodeOrderKey,
  type TreeDragPayload,
} from "../document-tree-order.js";

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

type DocumentTreeSharedProps = {
  depth: number;
  parentId: string | null;
  selectedPath?: string | null;
  onClearSelectedFolder?: () => void;
  onSelectFolder?: (folderId: string) => void;
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
};

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

function DocumentTreeItem({
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
}: DocumentTreeSharedProps & { document: DocumentTreeDocumentNode }) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(document.title);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isSelected = document.path === selectedPath;
  const isKeyboardHighlighted = highlightedNavItemId === document.id;
  const href = getDocumentHref(document.path);
  const paddingLeft = depth > 0 ? `${depth * 12}px` : undefined;
  const canDrag = Boolean(onReorderTreeItem);
  const showInsertIndicator =
    canDrag && dragInsertBeforeId === treeNodeOrderKey(document);

  function cancelRename() {
    setIsRenaming(false);
    setRenameValue(document.title);
    setError(null);
  }

  function submitRename() {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === document.title || !onRename) {
      cancelRename();
      return;
    }
    startTransition(async () => {
      setError(null);
      const result = await onRename(document.id, trimmed);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setIsRenaming(false);
    });
  }

  function handleDragStart(event: DragEvent<HTMLDivElement>) {
    if (!canDrag) return;
    const payload = {
      type: "document" as const,
      id: document.id,
      parentId,
    };
    event.dataTransfer.setData(
      DOCUMENT_TREE_DRAG_TYPE,
      createTreeDragPayload(document, parentId),
    );
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
        showInsertIndicator ? "app-side-panel-tree-insert-before" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      onDragOver={canDrag ? handleDragOver : undefined}
      onDrop={canDrag ? handleDrop : undefined}
    >
      <div style={paddingLeft ? { paddingLeft } : undefined}>
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
              isPending={isPending}
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
              {document.title}
            </Link>
          )}
        </div>
        {error ? <TreeErrorText error={error} /> : null}
      </div>
    </li>
  );
}

function DocumentTreeFolder({
  folder,
  depth,
  selectedPath,
  onClearSelectedFolder,
  onSelectFolder,
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
}: DocumentTreeSharedProps & { folder: DocumentTreeFolderNode }) {
  const collapsed = collapsedFolderIds.has(folder.id);
  const [isDragging, setIsDragging] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(folder.title);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const navId = folderNavId(folder.id);
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
    if (!onRename || isRenaming) {
      return;
    }

    return registerDocumentTreeFolderRenameHandler((focusedItemId) => {
      if (focusedItemId !== navId) {
        return false;
      }
      setIsRenaming(true);
      setError(null);
      return true;
    });
  }, [isRenaming, navId, onRename]);

  function cancelRename() {
    setIsRenaming(false);
    setRenameValue(folder.title);
    setError(null);
  }

  function submitRename() {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === folder.title || !onRename) {
      cancelRename();
      return;
    }
    startTransition(async () => {
      setError(null);
      const result = await onRename(folder.id, trimmed);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setIsRenaming(false);
    });
  }

  function handleDragStart(event: DragEvent<HTMLButtonElement>) {
    if (!canDrag) return;
    const payload = {
      type: "folder" as const,
      id: folder.id,
      parentId,
    };
    event.dataTransfer.setData(
      DOCUMENT_TREE_DRAG_TYPE,
      createTreeDragPayload(folder, parentId),
    );
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
              isPending={isPending}
              ariaLabel="Rename folder"
            />
          </div>
        ) : (
          <div
            className={`app-side-panel-tree-folder-row min-w-0 ${
              isKeyboardHighlighted && !showDropIntoHighlight
                ? "keyboard-nav-item-highlight"
                : ""
            }`}
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
                {folder.title}
              </span>
            </button>
          </div>
        )}
        {error ? <TreeErrorText error={error} /> : null}
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
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function DocumentTreeNodeView(
  props: DocumentTreeSharedProps & { node: DocumentTreeNode },
) {
  const { node, ...rest } = props;
  if (node.type === "folder") {
    return <DocumentTreeFolder folder={node} {...rest} />;
  }
  return <DocumentTreeItem document={node} {...rest} />;
}

"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type DragEvent,
} from "react";

import { keyboardNavItemProps } from "@/lib/shortcuts/keyboard-nav-item";
import { sidePanelItemClass } from "@/lib/side-panel-styles";
import { folderNavId } from "@/lib/documents/tree";
import type {
  DocumentTreeDocumentNode,
  DocumentTreeFolderNode,
  DocumentTreeNode,
} from "@/lib/documents/tree";
import { treeNodeOrderKey, type TreeDragPayload } from "@/lib/documents/tree-order-shared";
import { applyDesktopDragImage } from "@/lib/platform/desktop-drag-image";

import {
  createTreeDragPayload,
  DOCUMENT_TREE_DRAG_TYPE,
  isTreeDragActive,
  readTreeDragPayload,
  resolveFolderDragOverMode,
  resolveTreeDropAction,
  type TreeReorderRequest,
} from "./document-tree-drag";
import { DocumentOcticon } from "./document-octicon";

export { DOCUMENT_TREE_DRAG_TYPE };

type RenameResult = { ok: true } | { ok: false; error: string };

type DocumentTreeSharedProps = {
  depth: number;
  parentId: string | null;
  selectedPath?: string;
  onClearSelectedFolder?: () => void;
  onSelectFolder?: (folderId: string) => void;
  collapsedFolderIds: ReadonlySet<string>;
  onToggleFolderCollapsed: (folderId: string) => void;
  highlightedNavItemId?: string | null;
  getDocumentHref: (path: string) => string;
  onRename: (id: string, title: string) => Promise<RenameResult>;
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
    <p className="px-2.5 pt-0.5 text-xs text-red-400" role="alert">
      {error}
    </p>
  );
}

function DocumentTreeItem({
  document,
  depth,
  selectedPath,
  onClearSelectedFolder,
  highlightedNavItemId,
  getDocumentHref,
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
  const showInsertIndicator = dragInsertBeforeId === treeNodeOrderKey(document);

  function cancelRename() {
    setIsRenaming(false);
    setRenameValue(document.title);
    setError(null);
  }

  function submitRename() {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === document.title) {
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
    applyDesktopDragImage(event);
    onTreeDragStart?.(payload);
  }

  function handleDragOver(event: DragEvent<HTMLLIElement>) {
    if (!isTreeDragActive(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    onDragIntoFolderId?.(null);
    onDragInsertBeforeId?.(document.id);
  }

  function handleDrop(event: DragEvent<HTMLLIElement>) {
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
      className={`list-none ${showInsertIndicator ? "border-t border-[#ee7a47]/50" : ""}`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div style={paddingLeft ? { paddingLeft } : undefined}>
        <div
          data-tauri-drag-region="false"
          draggable={!isRenaming}
          onDragStart={isRenaming ? undefined : handleDragStart}
          onDragEnd={isRenaming ? undefined : onTreeDragEnd}
          className={`${sidePanelItemClass({
            active: isSelected,
            keyboardHighlighted: isKeyboardHighlighted || isRenaming,
          })} min-w-0 ${isRenaming ? "" : "cursor-grab active:cursor-grabbing"}`}
        >
          <span className="app-side-panel-item-icon text-foreground/50" aria-hidden="true">
            <DocumentOcticon icon={document.icon} className="size-3.5 shrink-0 text-current" />
          </span>
          {isRenaming ? (
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
              href={href}
              scroll={false}
              draggable={false}
              onClick={() => onClearSelectedFolder?.()}
              onDoubleClick={(event) => {
                event.preventDefault();
                setIsRenaming(true);
                setError(null);
              }}
              className="app-side-panel-item-label min-w-0 flex-1 text-inherit no-underline"
              title="Double-click to rename · Drag to reorder"
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
  const showInsertIndicator = dragInsertBeforeId === treeNodeOrderKey(folder);
  const showDropIntoHighlight = dragIntoFolderId === treeNodeOrderKey(folder);

  function cancelRename() {
    setIsRenaming(false);
    setRenameValue(folder.title);
    setError(null);
  }

  function submitRename() {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === folder.title) {
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
    applyDesktopDragImage(event);
    setIsDragging(true);
    onTreeDragStart?.(payload);
  }

  function handleDragEnd() {
    setIsDragging(false);
    onTreeDragEnd?.();
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!isTreeDragActive(event.dataTransfer)) return;
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
    <li className={`list-none ${showInsertIndicator && !showDropIntoHighlight ? "border-t border-[#ee7a47]/50" : ""}`}>
      <div
        className={`rounded-md transition-colors ${
          showDropIntoHighlight
            ? "bg-[#ee7a47]/15 ring-1 ring-inset ring-[#ee7a47]/55"
            : ""
        }`}
        style={paddingLeft ? { paddingLeft } : undefined}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {isRenaming ? (
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
              draggable
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onClick={() => {
                onToggleFolderCollapsed(folder.id);
                onSelectFolder?.(folder.id);
              }}
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsRenaming(true);
                setError(null);
              }}
              aria-expanded={!collapsed}
              className={`flex min-w-0 flex-1 items-center gap-1 border-0 bg-transparent p-0 text-left text-inherit ${
                isDragging ? "cursor-grabbing" : "cursor-grab active:cursor-grabbing"
              }`}
              title="Click to expand or collapse · Double-click to rename · Drag to reorder · Drop documents to move into folder"
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
        <ul className="flex flex-col gap-0.5">
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

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      width="12"
      height="12"
      aria-hidden="true"
      className="text-current transition-transform duration-150"
      style={{ transform: expanded ? "rotate(90deg)" : undefined }}
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

export function DocumentTreeNodeView(
  props: DocumentTreeSharedProps & { node: DocumentTreeNode },
) {
  const { node, ...rest } = props;
  if (node.type === "folder") {
    return <DocumentTreeFolder folder={node} {...rest} />;
  }
  return <DocumentTreeItem document={node} {...rest} />;
}

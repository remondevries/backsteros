"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

export type DocumentTreeFolderOverflowMenuProps = {
  open: boolean;
  x: number;
  y: number;
  folderTitle: string;
  /** Align menu start (left) or end (right) edge to `x`. Default `end`. */
  align?: "start" | "end";
  onClose: () => void;
  onSettings?: () => void;
  onRename?: () => void;
};

/**
 * Compact Settings / Rename popup for Spaces folder ⋯ actions.
 */
export function DocumentTreeFolderOverflowMenu({
  open,
  x,
  y,
  folderTitle,
  align = "end",
  onClose,
  onSettings,
  onRename,
}: DocumentTreeFolderOverflowMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({
    position: "fixed",
    visibility: "hidden",
  });

  useLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const width = panel?.offsetWidth ?? 140;
    const height = panel?.offsetHeight ?? 72;
    const rawLeft = align === "end" ? x - width : x;
    const left = Math.min(
      Math.max(8, rawLeft),
      window.innerWidth - width - 8,
    );
    const top = Math.min(
      Math.max(8, y),
      window.innerHeight - height - 8,
    );
    setStyle({
      position: "fixed",
      top,
      left,
      visibility: "visible",
      zIndex: 1300,
    });
  }, [align, open, x, y]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      if (panelRef.current?.contains(event.target)) return;
      onClose();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;
  if (!onSettings && !onRename) return null;

  return createPortal(
    <div
      ref={panelRef}
      className="relationship-label-overflow-menu"
      role="menu"
      aria-label={`Actions for ${folderTitle}`}
      style={style}
      data-document-tree-folder-overflow-menu=""
      data-searchable-dropdown-keep-open=""
      onMouseDown={(event) => event.stopPropagation()}
    >
      {onSettings ? (
        <button
          type="button"
          role="menuitem"
          className="relationship-label-overflow-menu__item"
          onClick={() => {
            onClose();
            onSettings();
          }}
        >
          Settings
        </button>
      ) : null}
      {onRename ? (
        <button
          type="button"
          role="menuitem"
          className="relationship-label-overflow-menu__item"
          onClick={() => {
            onClose();
            onRename();
          }}
        >
          Rename
        </button>
      ) : null}
    </div>,
    document.body,
  );
}

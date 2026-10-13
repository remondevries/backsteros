"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

export type RelationshipLabelOverflowMenuProps = {
  open: boolean;
  x: number;
  y: number;
  /** Align menu start (left) or end (right) edge to `x`. Default `end`. */
  align?: "start" | "end";
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
};

/**
 * Compact Edit / Delete popup for relationship label ⋯ actions.
 * Delete is two-step: Delete → Confirm delete.
 */
export function RelationshipLabelOverflowMenu({
  open,
  x,
  y,
  align = "end",
  onClose,
  onEdit,
  onDelete,
}: RelationshipLabelOverflowMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({
    position: "fixed",
    visibility: "hidden",
  });

  useEffect(() => {
    if (!open) setConfirmDelete(false);
  }, [open]);

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
  }, [align, confirmDelete, open, x, y]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      if (panelRef.current?.contains(event.target)) return;
      onClose();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (confirmDelete) {
          setConfirmDelete(false);
          return;
        }
        onClose();
      }
    }
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [confirmDelete, onClose, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      className="relationship-label-overflow-menu"
      role="menu"
      aria-label="Label actions"
      style={style}
      data-relationship-label-overflow-menu=""
      data-searchable-dropdown-keep-open=""
      onMouseDown={(event) => event.stopPropagation()}
    >
      {confirmDelete ? (
        <>
          <button
            type="button"
            role="menuitem"
            className="relationship-label-overflow-menu__item"
            onClick={() => setConfirmDelete(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            role="menuitem"
            className="relationship-label-overflow-menu__item is-danger is-confirm"
            onClick={() => {
              onClose();
              onDelete?.();
            }}
          >
            Confirm delete
          </button>
        </>
      ) : (
        <>
          {onEdit ? (
            <button
              type="button"
              role="menuitem"
              className="relationship-label-overflow-menu__item"
              onClick={() => {
                onClose();
                onEdit();
              }}
            >
              Edit
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              role="menuitem"
              className="relationship-label-overflow-menu__item is-danger"
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </button>
          ) : null}
        </>
      )}    </div>,
    document.body,
  );
}

function KebabHorizontalIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M2.75 8a1.25 1.25 0 1 1 2.5 0 1.25 1.25 0 0 1-2.5 0Zm4 0a1.25 1.25 0 1 1 2.5 0 1.25 1.25 0 0 1-2.5 0Zm4 0a1.25 1.25 0 1 1 2.5 0 1.25 1.25 0 0 1-2.5 0Z"
      />
    </svg>
  );
}

export { KebabHorizontalIcon };

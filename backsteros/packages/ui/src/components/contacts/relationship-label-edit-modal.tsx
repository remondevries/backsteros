"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";

export type RelationshipLabelEditValues = {
  sideALabel: string;
  sideBLabel: string;
  color: string | null;
};

export type RelationshipLabelEditModalProps = {
  open: boolean;
  mode: "create" | "edit";
  initial: RelationshipLabelEditValues;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (values: RelationshipLabelEditValues) => void | Promise<void>;
};

function BidirectionalLabelIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M5.75 7.5c0 .414.336.75.75.75h6.97v3.28a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0 0-1.06l-3.5-3.5a.75.75 0 0 0-1.06 0v3.28H6.5a.75.75 0 0 0-.75.75m12.5 9a.75.75 0 0 1-.75.75h-6.97v3.28a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 0 1 0-1.06l3.5-3.5a.75.75 0 0 1 1.06 0v3.28h6.97a.75.75 0 0 1 .75.75" />
    </svg>
  );
}

/**
 * Create/edit modal for a bidirectional relationship label pair.
 * Layout: [side A] ↔ [side B], plus color (stored for later use).
 */
export function RelationshipLabelEditModal({
  open,
  mode,
  initial,
  busy = false,
  error = null,
  onClose,
  onSave,
}: RelationshipLabelEditModalProps) {
  const titleId = useId();
  const sideARef = useRef<HTMLInputElement>(null);
  const [sideALabel, setSideALabel] = useState(initial.sideALabel);
  const [sideBLabel, setSideBLabel] = useState(initial.sideBLabel);
  const [color, setColor] = useState(initial.color ?? "");

  useEffect(() => {
    if (!open) return;
    setSideALabel(initial.sideALabel);
    setSideBLabel(initial.sideBLabel);
    setColor(initial.color ?? "");
    const frame = window.requestAnimationFrame(() => {
      sideARef.current?.focus();
      sideARef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose, open]);

  if (!open || typeof document === "undefined") return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const a = sideALabel.trim();
    const b = sideBLabel.trim();
    if (!a || !b || busy) return;
    await onSave({
      sideALabel: a,
      sideBLabel: b,
      color: color.trim() ? color.trim() : null,
    });
  }

  return createPortal(
    <div
      className="relationship-label-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="relationship-label-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className="relationship-label-modal__title">
          {mode === "create" ? "New relationship label" : "Edit relationship label"}
        </h2>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="relationship-label-modal__pair">
            <input
              ref={sideARef}
              type="text"
              className="relationship-label-modal__input"
              aria-label="This side label"
              placeholder="e.g. Parent"
              value={sideALabel}
              disabled={busy}
              onChange={(event) => setSideALabel(event.target.value)}
            />
            <span
              className="relationship-label-modal__swap"
              title="Other side"
              aria-hidden="true"
            >
              <BidirectionalLabelIcon />
            </span>
            <input
              type="text"
              className="relationship-label-modal__input"
              aria-label="Other side label"
              placeholder="e.g. Child"
              value={sideBLabel}
              disabled={busy}
              onChange={(event) => setSideBLabel(event.target.value)}
            />
          </div>
          <label className="relationship-label-modal__color">
            <span className="relationship-label-modal__color-label">Color</span>
            <input
              type="color"
              disabled={busy}
              value={color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#888888"}
              onChange={(event) => setColor(event.target.value)}
              aria-label="Label color"
            />
            <input
              type="text"
              className="relationship-label-modal__input relationship-label-modal__input--color"
              placeholder="#888888"
              disabled={busy}
              value={color}
              onChange={(event) => setColor(event.target.value)}
              aria-label="Label color hex"
            />
          </label>
          {error ? (
            <p className="relationship-label-modal__error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="relationship-label-modal__actions">
            <button
              type="button"
              className="relationship-label-modal__button"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="relationship-label-modal__button relationship-label-modal__button--primary"
              disabled={busy || !sideALabel.trim() || !sideBLabel.trim()}
            >
              {mode === "create" ? "Create" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

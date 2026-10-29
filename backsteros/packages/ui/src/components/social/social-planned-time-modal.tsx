"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type SocialPlannedTimeModalProps = {
  open: boolean;
  /** Local day the draft was dropped on (`YYYY-MM-DD`). */
  dateYmd: string;
  /** Default publish time (`HH:mm`, 24h). */
  defaultTime?: string;
  postPreview?: string;
  onCancel: () => void;
  onConfirm: (timeHHmm: string) => void;
};

function formatDateLabel(dateYmd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYmd.trim());
  if (!match) return dateYmd;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    12,
    0,
    0,
    0,
  );
  if (Number.isNaN(date.getTime())) return dateYmd;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Ask for a publish time after dropping a draft on the month grid. */
export function SocialPlannedTimeModal({
  open,
  dateYmd,
  defaultTime = "09:00",
  postPreview,
  onCancel,
  onConfirm,
}: SocialPlannedTimeModalProps) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [time, setTime] = useState(defaultTime);

  useEffect(() => {
    if (!open) return;
    setTime(defaultTime);
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [defaultTime, open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCancel();
        return;
      }
      if (event.key === "Enter") {
        const target = event.target;
        if (
          target instanceof HTMLInputElement &&
          target.type === "time" &&
          !target.value
        ) {
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        if (/^\d{2}:\d{2}$/.test(time)) onConfirm(time);
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onCancel, onConfirm, open, time]);

  if (!open || typeof document === "undefined") return null;

  const dateLabel = formatDateLabel(dateYmd);
  const preview = postPreview?.trim() ?? "";
  const canConfirm = /^\d{2}:\d{2}$/.test(time);

  return createPortal(
    <div
      className="entity-delete-modal-root social-planned-time-modal-root"
      data-blocking-modal=""
      data-social-planned-time-modal=""
    >
      <button
        type="button"
        aria-label="Cancel scheduling"
        className="entity-delete-modal-backdrop"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="entity-delete-modal social-planned-time-modal"
      >
        <h2 id={titleId} className="entity-delete-modal-title">
          Set publish time
        </h2>
        <p className="entity-delete-modal-body">
          Month view doesn’t have time slots. Choose when to publish on{" "}
          <strong>{dateLabel}</strong>.
        </p>
        {preview ? (
          <p className="social-planned-time-modal__preview" title={preview}>
            {preview}
          </p>
        ) : null}
        <label className="social-planned-time-modal__field">
          <span className="social-planned-time-modal__label">Time</span>
          <input
            ref={inputRef}
            type="time"
            step={60}
            value={time}
            onChange={(event) => setTime(event.target.value)}
            className="social-planned-time-modal__input"
            aria-label="Publish time"
          />
        </label>
        <div className="entity-delete-modal-actions">
          <button
            type="button"
            className="entity-delete-modal-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="entity-delete-modal-confirm social-planned-time-modal__confirm"
            disabled={!canConfirm}
            onClick={() => {
              if (canConfirm) onConfirm(time);
            }}
          >
            Schedule
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

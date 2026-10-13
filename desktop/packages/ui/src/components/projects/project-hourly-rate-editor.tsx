"use client";

import { useRef, useState } from "react";

import {
  formatMoneyInput,
  moneyCentsToInput,
  parseMoneyInput,
} from "../../finance/money-input.js";

export type ProjectHourlyRateEditorProps = {
  value: number | null;
  disabled?: boolean;
  onChange?: (next: number | null) => void;
  onSave: (next: number | null) => void;
};

/**
 * Hourly rate as a split pill: fixed “Hourly” label | € amount
 * (same chrome as Budget; label is not editable).
 */
export function ProjectHourlyRateEditor({
  value,
  disabled = false,
  onChange,
  onSave,
}: ProjectHourlyRateEditorProps) {
  const committedRef = useRef<number | null | undefined>(undefined);
  if (
    committedRef.current !== undefined &&
    (value ?? null) === (committedRef.current ?? null)
  ) {
    committedRef.current = undefined;
  }

  const effectiveValue =
    committedRef.current !== undefined ? committedRef.current : value;
  const remote = moneyCentsToInput(effectiveValue, { alwaysFraction: true });
  const [draft, setDraft] = useState(remote);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!editing && draft !== remote) {
    setDraft(remote);
  }

  function commit(raw: string) {
    const next = parseMoneyInput(raw, { positive: true });
    const normalized = moneyCentsToInput(next, { alwaysFraction: true });
    committedRef.current = next;
    setDraft(normalized);
    setEditing(false);
    onChange?.(next);
    if (next === value || (next == null && value == null)) return;
    onSave(next);
  }

  return (
    <div className="contact-detail-chips">
      <div className="contact-detail-chips__row">
        <div
          className={[
            "contact-detail-split-chip",
            "project-billing-chip",
            "project-hourly-rate-chip",
            !draft.trim() ? "is-muted" : null,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span
            className="contact-detail-split-chip__label contact-detail-split-chip__label--muted project-hourly-rate-chip__label"
            aria-hidden
          >
            Hourly
          </span>
          <span className="project-hourly-rate-chip__currency" aria-hidden>
            €
          </span>
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            aria-label="Hourly rate"
            value={draft}
            disabled={disabled}
            placeholder="0,00"
            size={Math.max(draft.length, "0,00".length, 4)}
            onFocus={() => setEditing(true)}
            onChange={(event) => {
              const next = formatMoneyInput(event.target.value);
              setDraft(next);
              onChange?.(parseMoneyInput(next, { positive: true }));
            }}
            onBlur={(event) => commit(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                (event.target as HTMLInputElement).blur();
              }
            }}
            className="contact-detail-split-chip__value"
          />
        </div>
      </div>
    </div>
  );
}

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
  /**
   * `split` — fixed “Hourly” label | € amount (full project detail).
   * `chip` — € amount only, matches other property chips (panel overview).
   */
  variant?: "split" | "chip";
};

/**
 * Hourly rate editor — split pill or value-only property chip.
 */
export function ProjectHourlyRateEditor({
  value,
  disabled = false,
  onChange,
  onSave,
  variant = "split",
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

  const amountInput = (
    <>
      <span
        className={
          variant === "chip"
            ? "project-billing-value-chip__currency"
            : "project-hourly-rate-chip__currency"
        }
        aria-hidden
      >
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
        className={
          variant === "chip"
            ? "project-billing-value-chip__value"
            : "contact-detail-split-chip__value"
        }
      />
    </>
  );

  if (variant === "chip") {
    return (
      <div
        className={[
          "property-dropdown-trigger",
          "property-dropdown-trigger--inline-chip",
          "project-billing-value-chip",
          disabled ? "property-dropdown-trigger--static" : null,
          !draft.trim() ? "is-muted" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => {
          if (!disabled) inputRef.current?.focus();
        }}
      >
        {amountInput}
      </div>
    );
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
          {amountInput}
        </div>
      </div>
    </div>
  );
}

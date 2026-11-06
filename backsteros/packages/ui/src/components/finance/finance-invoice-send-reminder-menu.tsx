"use client";

import { ChevronDownIcon } from "@primer/octicons-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { isEditableShortcutTarget } from "../../shortcuts/shortcut-guards.js";
import {
  SegmentedPillToggle,
  type SegmentedPillToggleOption,
} from "../list-nav/list-board-view-shell.js";

function looksLikeEmail(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export type FinanceInvoiceSendEmailKind = "invoice" | "1" | "2" | "3";

const SEND_KIND_OPTIONS: readonly SegmentedPillToggleOption<FinanceInvoiceSendEmailKind>[] =
  [
    { value: "invoice", label: "Send invoice", shortcut: "1" },
    { value: "1", label: "1 Reminder", shortcut: "2" },
    { value: "2", label: "2 Reminder", shortcut: "3" },
    { value: "3", label: "3 Reminder", shortcut: "4" },
  ];

function defaultKind(
  nextStep: 1 | 2 | 3 | null | undefined,
): FinanceInvoiceSendEmailKind {
  if (nextStep === 1 || nextStep === 2 || nextStep === 3) {
    return String(nextStep) as FinanceInvoiceSendEmailKind;
  }
  return "invoice";
}

function kindFromHotkey(key: string): FinanceInvoiceSendEmailKind | null {
  switch (key) {
    case "1":
      return "invoice";
    case "2":
      return "1";
    case "3":
      return "2";
    case "4":
      return "3";
    default:
      return null;
  }
}

function focusEmailInput(input: HTMLInputElement | null) {
  if (!input) return;
  input.focus();
  input.select();
}

function isOurEmailInput(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.classList.contains("finance-invoice-send-reminder__input")
  );
}

export type FinanceInvoiceSendReminderMenuProps = {
  defaultEmail?: string | null;
  nextStep?: 1 | 2 | 3 | null;
  pending?: boolean;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSend: (input: {
    to: string;
    kind: FinanceInvoiceSendEmailKind;
  }) => void | Promise<void>;
};

export function FinanceInvoiceSendReminderMenu({
  defaultEmail = null,
  nextStep = null,
  pending = false,
  disabled = false,
  open: openProp,
  onOpenChange,
  onSend,
}: FinanceInvoiceSendReminderMenuProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : uncontrolledOpen;

  function setOpen(next: boolean | ((current: boolean) => boolean)) {
    const resolved = typeof next === "function" ? next(open) : next;
    if (!controlled) setUncontrolledOpen(resolved);
    onOpenChange?.(resolved);
  }

  const [email, setEmail] = useState(defaultEmail?.trim() || "");
  const [kind, setKind] = useState<FinanceInvoiceSendEmailKind>(() =>
    defaultKind(nextStep),
  );
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    setEmail(defaultEmail?.trim() || "");
    setKind(defaultKind(nextStep));
    setError(null);
    const frame = window.requestAnimationFrame(() => {
      focusEmailInput(inputRef.current);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [defaultEmail, nextStep, open]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const root = rootRef.current;
      if (!root) return;
      if (event.target instanceof Node && root.contains(event.target)) return;
      setOpen(false);
    }

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setOpen(false);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }

      const nextKind = kindFromHotkey(event.key);
      if (!nextKind) return;

      // Allow 1–4 in our email field; yield for other editable targets.
      if (isEditableShortcutTarget(event.target) && !isOurEmailInput(event.target)) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      setKind(nextKind);
      window.requestAnimationFrame(() => {
        focusEmailInput(inputRef.current);
      });
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  async function submit() {
    const to = email.trim();
    if (!looksLikeEmail(to)) {
      setError("Enter a valid email address");
      return;
    }
    setError(null);
    try {
      await onSend({ to, kind });
      setOpen(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to send email",
      );
    }
  }

  function onFormSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" && !open) {
      event.preventDefault();
      setOpen(true);
    }
  }

  function selectKind(next: FinanceInvoiceSendEmailKind) {
    setKind(next);
    focusEmailInput(inputRef.current);
  }

  const triggerLabel = pending ? "Sending…" : "Send e-mail";

  return (
    <div
      className={[
        "finance-invoice-send-reminder",
        open ? "is-open" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      ref={rootRef}
    >
      <button
        type="button"
        className="finance-invoice-detail-toolbar__reminder"
        disabled={disabled || pending}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        title="Send invoice or payment reminder email (3)"
        onClick={() => setOpen(!open)}
        onKeyDown={onTriggerKeyDown}
      >
        <span>{triggerLabel}</span>
        <ChevronDownIcon size={12} aria-hidden="true" />
      </button>

      {open ? (
        <form
          id={panelId}
          className="finance-invoice-send-reminder__panel"
          role="dialog"
          aria-label="Send e-mail"
          onSubmit={onFormSubmit}
        >
          <div className="finance-invoice-send-reminder__kind">
            <SegmentedPillToggle
              value={kind}
              options={SEND_KIND_OPTIONS}
              onChange={selectKind}
              ariaLabel="Email type"
              disabled={pending}
            />
          </div>
          <label
            className="finance-invoice-send-reminder__label"
            htmlFor={`${panelId}-email`}
          >
            Send to
          </label>
          <input
            id={`${panelId}-email`}
            ref={inputRef}
            type="email"
            autoComplete="email"
            spellCheck={false}
            className="finance-invoice-send-reminder__input"
            value={email}
            placeholder="name@example.com"
            disabled={pending}
            onChange={(event) => {
              setEmail(event.target.value);
              if (error) setError(null);
            }}
          />
          {error ? (
            <p className="finance-invoice-send-reminder__error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="finance-invoice-send-reminder__actions">
            <button
              type="button"
              className="finance-invoice-send-reminder__cancel"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="finance-invoice-send-reminder__submit"
              disabled={pending || !email.trim()}
            >
              {pending ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

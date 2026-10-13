"use client";

import type { FinancialGoalListing } from "@backsteros/contracts";
import type { ReactNode } from "react";
import { CheckIcon, ChevronLeftIcon } from "@primer/octicons-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

import { useEntityHeaderActionsContext } from "../entity-actions/entity-header-actions-context.js";

const LISTING_OPTIONS: Array<{
  value: FinancialGoalListing;
  label: string;
  detailLabel: string;
}> = [
  { value: "active", label: "Active", detailLabel: "Active goal" },
  {
    value: "ready_to_spend",
    label: "Ready to spend",
    detailLabel: "Ready to spend",
  },
  { value: "archive", label: "Archive", detailLabel: "Archived goal" },
];

const GOAL_ACTIONS_MENU_GAP = 6;
const GOAL_ACTIONS_VIEWPORT_PADDING = 8;
const GOAL_ACTIONS_MIN_WIDTH = 220;

export function GoalActionsMenu({
  currentListing,
  onSetListing,
  onDelete,
  disabled = false,
}: {
  currentListing: FinancialGoalListing;
  onSetListing: (listing: FinancialGoalListing) => void;
  onDelete: () => void | Promise<void>;
  disabled?: boolean;
}) {
  const { openDeleteModal } = useEntityHeaderActionsContext();
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState<"listing" | null>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({
    position: "fixed",
    visibility: "hidden",
  });

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const panelHeight = panelRef.current?.offsetHeight ?? 48;
    const spaceBelow =
      window.innerHeight -
      rect.bottom -
      GOAL_ACTIONS_MENU_GAP -
      GOAL_ACTIONS_VIEWPORT_PADDING;
    const openUpward =
      spaceBelow < panelHeight &&
      rect.top > panelHeight + GOAL_ACTIONS_MENU_GAP;
    const top = openUpward
      ? Math.max(
          GOAL_ACTIONS_VIEWPORT_PADDING,
          rect.top - panelHeight - GOAL_ACTIONS_MENU_GAP,
        )
      : rect.bottom + GOAL_ACTIONS_MENU_GAP;
    setPanelStyle({
      position: "fixed",
      top: `${top}px`,
      right: `${Math.max(
        GOAL_ACTIONS_VIEWPORT_PADDING,
        window.innerWidth - rect.right,
      )}px`,
      left: "auto",
      width: "max-content",
      minWidth: `${GOAL_ACTIONS_MIN_WIDTH}px`,
      maxWidth: `calc(100vw - ${GOAL_ACTIONS_VIEWPORT_PADDING * 2}px)`,
      visibility: "visible",
      zIndex: 1000,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    return () => window.cancelAnimationFrame(frame);
  }, [open, submenu, updatePosition]);

  useEffect(() => {
    if (!open) return;
    function reposition() {
      updatePosition();
    }
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!(event.target instanceof Node)) return;
      if (triggerRef.current?.contains(event.target)) return;
      if (panelRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setSubmenu((current) => {
        if (current) return null;
        setOpen(false);
        return null;
      });
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setSubmenu(null);
  }, [open]);

  const closeMenu = () => setOpen(false);

  let panelBody: ReactNode;
  if (submenu === "listing") {
    panelBody = (
      <>
        <button
          type="button"
          className="finance-categories-menu__back"
          onClick={() => setSubmenu(null)}
        >
          <ChevronLeftIcon size={14} />
          <span>Goal status</span>
        </button>
        <div className="finance-categories-menu__section">
          {LISTING_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={currentListing === option.value}
              className="finance-categories-menu__item"
              onClick={() => {
                onSetListing(option.value);
                closeMenu();
              }}
            >
              <span>{option.detailLabel}</span>
              {currentListing === option.value ? (
                <CheckIcon size={14} />
              ) : null}
            </button>
          ))}
        </div>
      </>
    );
  } else {
    panelBody = (
      <>
        <div className="finance-categories-menu__section">
          <button
            type="button"
            className="finance-categories-menu__item finance-categories-menu__item--drill"
            onClick={() => setSubmenu("listing")}
          >
            <span>Status</span>
            <span className="finance-categories-menu__meta">
              {LISTING_OPTIONS.find((option) => option.value === currentListing)
                ?.label ?? "Active"}
            </span>
          </button>
        </div>
        <div className="finance-categories-menu__section">
          <button
            type="button"
            className="finance-categories-menu__item finance-categories-menu__item--danger"
            onClick={() => {
              closeMenu();
              openDeleteModal({
                entityLabel: "goal",
                confirmLabel: "Delete goal",
                onDelete: async () => {
                  try {
                    await Promise.resolve(onDelete());
                    return { ok: true };
                  } catch (reason) {
                    return {
                      ok: false,
                      error:
                        reason instanceof Error
                          ? reason.message
                          : "Could not delete goal.",
                    };
                  }
                },
              });
            }}
          >
            Delete goal
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="entity-header-actions-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        ···
      </button>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              id={menuId}
              role="menu"
              className="finance-categories-menu"
              style={panelStyle}
            >
              {panelBody}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export type CreateModalState = { listing: FinancialGoalListing } | null;

export function CreateGoalModal({
  state,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  state: CreateModalState;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (name: string) => void | Promise<void>;
}) {
  const titleId = useId();
  const [name, setName] = useState("");

  useEffect(() => {
    if (!state) return;
    setName("");
  }, [state]);

  useEffect(() => {
    if (!state) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose, state]);

  if (!state) return null;

  const listingLabel =
    LISTING_OPTIONS.find((option) => option.value === state.listing)?.label ??
    "Active";
  const title = `Add ${listingLabel.toLowerCase()} goal`;

  return createPortal(
    <div
      className="entity-delete-modal-root"
      data-blocking-modal=""
      data-finance-goal-create-modal=""
    >
      <button
        type="button"
        aria-label="Cancel"
        className="entity-delete-modal-backdrop"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="entity-delete-modal finance-bank-account-modal"
      >
        <h2 id={titleId} className="sr-only">
          {title}
        </h2>
        <form
          className="finance-bank-account-modal__form"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (!trimmed || pending) return;
            void onSubmit(trimmed);
          }}
        >
          <div className="finance-bank-account-modal__body">
            <p className="finance-categories-view__create-title">{title}</p>
            <label className="finance-bank-account-modal__field">
              <span className="finance-bank-account-modal__label">Name</span>
              <input
                className="finance-bank-account-modal__input"
                value={name}
                autoFocus
                disabled={pending}
                placeholder="Emergency fund"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            {error ? (
              <p className="entity-delete-modal-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <div className="finance-bank-account-modal__actions">
            <span />
            <div className="finance-bank-account-modal__actions-end">
              <button
                type="button"
                disabled={pending}
                onClick={onClose}
                className="entity-delete-modal-cancel"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending || !name.trim()}
                className="finance-bank-account-modal__save"
              >
                {pending ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

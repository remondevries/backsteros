"use client";

import type {
  FinancialCategory,
  FinancialCategoryKind,
  FinancialCategoryListing,
} from "@backsteros/contracts";
import type { ReactNode } from "react";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@primer/octicons-react";
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
import {
  KIND_OPTIONS,
  LISTING_OPTIONS,
  type FinanceCategoryGroupOption,
} from "./finance-categories-shared.js";

type CategoryActionsSubmenu = "type" | "kind" | "group";

const CATEGORY_ACTIONS_MENU_GAP = 6;
const CATEGORY_ACTIONS_VIEWPORT_PADDING = 8;
const CATEGORY_ACTIONS_MIN_WIDTH = 208;

/**
 * ⋯ overflow menu for the selected category chrome: a compact two-level
 * dropdown (drill-down, not a modal) for changing type / kind / group, plus delete.
 */
export function CategoryActionsMenu({
  category,
  currentListing,
  currentKind,
  currentParentId,
  canChangeGroup,
  groupOptions,
  onSetListing,
  onSetKind,
  onSetGroup,
  onDelete,
  disabled = false,
}: {
  category: FinancialCategory;
  currentListing: FinancialCategoryListing;
  currentKind: FinancialCategoryKind;
  currentParentId: string | null;
  canChangeGroup: boolean;
  groupOptions: FinanceCategoryGroupOption[];
  onSetListing: (listing: FinancialCategoryListing) => void;
  onSetKind: (kind: FinancialCategoryKind) => void;
  onSetGroup: (parentId: string | null) => void;
  onDelete: () => void | Promise<void>;
  disabled?: boolean;
}) {
  const { openDeleteModal } = useEntityHeaderActionsContext();
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState<CategoryActionsSubmenu | null>(null);
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
      CATEGORY_ACTIONS_MENU_GAP -
      CATEGORY_ACTIONS_VIEWPORT_PADDING;
    const openUpward =
      spaceBelow < panelHeight &&
      rect.top > panelHeight + CATEGORY_ACTIONS_MENU_GAP;
    const top = openUpward
      ? Math.max(
          CATEGORY_ACTIONS_VIEWPORT_PADDING,
          rect.top - panelHeight - CATEGORY_ACTIONS_MENU_GAP,
        )
      : rect.bottom + CATEGORY_ACTIONS_MENU_GAP;
    setPanelStyle({
      position: "fixed",
      top: `${top}px`,
      right: `${Math.max(
        CATEGORY_ACTIONS_VIEWPORT_PADDING,
        window.innerWidth - rect.right,
      )}px`,
      left: "auto",
      width: "max-content",
      minWidth: `${CATEGORY_ACTIONS_MIN_WIDTH}px`,
      maxWidth: `calc(100vw - ${CATEGORY_ACTIONS_VIEWPORT_PADDING * 2}px)`,
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
  if (submenu === "type") {
    panelBody = (
      <>
        <button
          type="button"
          className="finance-categories-menu__back"
          onClick={() => setSubmenu(null)}
        >
          <ChevronLeftIcon size={14} />
          <span>Spending category type</span>
        </button>
        <div className="finance-categories-menu__section">
          {LISTING_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={currentListing === option.value}
              className="finance-categories-menu__item finance-categories-menu__item--check"
              onClick={() => {
                if (currentListing !== option.value) onSetListing(option.value);
                closeMenu();
              }}
            >
              <span className="finance-categories-menu__check" aria-hidden="true">
                {currentListing === option.value ? <CheckIcon size={14} /> : null}
              </span>
              <span className="finance-categories-menu__label">
                {option.detailLabel}
              </span>
            </button>
          ))}
        </div>
      </>
    );
  } else if (submenu === "kind") {
    panelBody = (
      <>
        <button
          type="button"
          className="finance-categories-menu__back"
          onClick={() => setSubmenu(null)}
        >
          <ChevronLeftIcon size={14} />
          <span>Category kind</span>
        </button>
        <div className="finance-categories-menu__section">
          {KIND_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={currentKind === option.value}
              className="finance-categories-menu__item finance-categories-menu__item--check"
              onClick={() => {
                if (currentKind !== option.value) onSetKind(option.value);
                closeMenu();
              }}
            >
              <span className="finance-categories-menu__check" aria-hidden="true">
                {currentKind === option.value ? <CheckIcon size={14} /> : null}
              </span>
              <span className="finance-categories-menu__label">
                {option.label}
              </span>
            </button>
          ))}
        </div>
      </>
    );
  } else if (submenu === "group") {
    panelBody = (
      <>
        <button
          type="button"
          className="finance-categories-menu__back"
          onClick={() => setSubmenu(null)}
        >
          <ChevronLeftIcon size={14} />
          <span>Spending category group</span>
        </button>
        <div className="finance-categories-menu__section finance-categories-menu__section--scroll">
          {groupOptions.map((option) => {
            const active = (option.id ?? null) === (currentParentId ?? null);
            return (
              <button
                key={option.id ?? "__top__"}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className="finance-categories-menu__item finance-categories-menu__item--check"
                onClick={() => {
                  if (!active) onSetGroup(option.id);
                  closeMenu();
                }}
              >
                <span
                  className="finance-categories-menu__check"
                  aria-hidden="true"
                >
                  {active ? <CheckIcon size={14} /> : null}
                </span>
                <span className="finance-categories-menu__label">
                  {option.name}
                </span>
              </button>
            );
          })}
        </div>
      </>
    );
  } else {
    panelBody = (
      <div className="finance-categories-menu__section">
        <button
          type="button"
          role="menuitem"
          className="finance-categories-menu__item finance-categories-menu__item--parent"
          onClick={() => setSubmenu("type")}
        >
          <span className="finance-categories-menu__label">
            Spending category type
          </span>
          <ChevronRightIcon size={14} />
        </button>
        <button
          type="button"
          role="menuitem"
          className="finance-categories-menu__item finance-categories-menu__item--parent"
          onClick={() => setSubmenu("kind")}
        >
          <span className="finance-categories-menu__label">Category kind</span>
          <ChevronRightIcon size={14} />
        </button>
        {canChangeGroup ? (
          <button
            type="button"
            role="menuitem"
            className="finance-categories-menu__item finance-categories-menu__item--parent"
            onClick={() => setSubmenu("group")}
          >
            <span className="finance-categories-menu__label">
              Spending category group
            </span>
            <ChevronRightIcon size={14} />
          </button>
        ) : null}
        <div className="finance-categories-menu__divider" role="separator" />
        <button
          type="button"
          role="menuitem"
          className="finance-categories-menu__item finance-categories-menu__item--danger"
          onClick={() => {
            closeMenu();
            openDeleteModal({
              entityLabel: category.name,
              confirmLabel: "Delete category",
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
                        : "Could not delete category.",
                  };
                }
              },
            });
          }}
        >
          <span className="finance-categories-menu__label">Delete category</span>
        </button>
      </div>
    );
  }

  const panel = open ? (
    <div
      ref={panelRef}
      id={menuId}
      className="entity-header-action-menu finance-categories-menu"
      style={panelStyle}
      role="menu"
      aria-label={`Actions for ${category.name}`}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {panelBody}
    </div>
  ) : null;

  return (
    <div className="entity-header-actions-trigger-wrap">
      <button
        ref={triggerRef}
        type="button"
        className="entity-header-actions-trigger"
        aria-label="Category actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
          setOpen((value) => !value);
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="3" cy="8" r="1.25" />
          <circle cx="8" cy="8" r="1.25" />
          <circle cx="13" cy="8" r="1.25" />
        </svg>
      </button>
      {panel ? createPortal(panel, document.body) : null}
    </div>
  );
}

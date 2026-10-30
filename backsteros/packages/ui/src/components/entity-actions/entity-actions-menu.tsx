"use client";

import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "@primer/octicons-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { useMounted } from "./use-mounted.js";

const PANEL_GAP = 8;
const VIEWPORT_PADDING = 8;
const PANEL_MIN_WIDTH = 168;

export type EntityActionsMenuSubItem = {
  id: string;
  label: string;
  /** Return `false` to keep the menu open. */
  onSelect: () => void | false;
  selected?: boolean;
  disabled?: boolean;
};

export type EntityActionsMenuItem = {
  id: string;
  label: string;
  /**
   * Return `false` to keep the menu open (e.g. two-step delete confirm).
   * Any other return closes the menu.
   */
  onSelect: () => void | false;
  danger?: boolean;
  disabled?: boolean;
  /** Optional leading 16px icon. */
  icon?: ReactNode;
  /** Current value shown trailing the label (e.g. project type). */
  trailingLabel?: string;
  /** When set, selecting the item drills into this submenu instead of running onSelect. */
  submenu?: readonly EntityActionsMenuSubItem[];
};

export type EntityActionsMenuProps = {
  items: EntityActionsMenuItem[];
  /** Accessible name for the menu panel. */
  ariaLabel?: string;
  /** Accessible name for the ⋯ trigger. */
  triggerAriaLabel?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  /** Fires when the menu opens or closes. */
  onOpenChange?: (open: boolean) => void;
  /** Optional leading content in the menu (unused by default). */
  children?: ReactNode;
};

/**
 * Three-dot overflow menu used by entity header actions (delete, etc.).
 * Portal-positioned panel aligned to the trigger. Items may open a one-level
 * drill-down submenu (e.g. project Type).
 */
export function EntityActionsMenu({
  items,
  ariaLabel = "Actions",
  triggerAriaLabel = "More actions",
  disabled = false,
  className,
  triggerClassName = "entity-header-actions-trigger",
  onOpenChange,
}: EntityActionsMenuProps) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const mounted = useMounted();
  const [menuOpen, setMenuOpen] = useState(false);
  const [submenuId, setSubmenuId] = useState<string | null>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({
    position: "fixed",
    visibility: "hidden",
  });
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const wasOpenRef = useRef(false);

  const setOpen = useCallback((open: boolean) => {
    setMenuOpen(open);
    if (!open) setSubmenuId(null);
  }, []);

  const closeMenu = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  useEffect(() => {
    if (wasOpenRef.current === menuOpen) return;
    wasOpenRef.current = menuOpen;
    onOpenChangeRef.current?.(menuOpen);
  }, [menuOpen]);

  const updatePanelPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const panelHeight = panelRef.current?.offsetHeight ?? 48;
    const spaceBelow =
      window.innerHeight - rect.bottom - PANEL_GAP - VIEWPORT_PADDING;
    const openUpward =
      spaceBelow < panelHeight && rect.top > panelHeight + PANEL_GAP;
    const top = openUpward
      ? Math.max(VIEWPORT_PADDING, rect.top - panelHeight - PANEL_GAP)
      : rect.bottom + PANEL_GAP;

    setPanelStyle({
      position: "fixed",
      top: `${top}px`,
      right: `${Math.max(VIEWPORT_PADDING, window.innerWidth - rect.right)}px`,
      left: "auto",
      width: "max-content",
      minWidth: `${PANEL_MIN_WIDTH}px`,
      maxWidth: `calc(100vw - ${VIEWPORT_PADDING * 2}px)`,
      visibility: "visible",
      zIndex: 1000,
    });
  }, []);

  useLayoutEffect(() => {
    if (!menuOpen) {
      return;
    }

    updatePanelPosition();
    const frame = window.requestAnimationFrame(() => {
      updatePanelPosition();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [menuOpen, submenuId, updatePanelPosition]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handleReposition() {
      updatePanelPosition();
    }

    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [menuOpen, updatePanelPosition]);

  useEffect(() => {
    if (!menuOpen) {
      setSubmenuId(null);
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (triggerRef.current?.contains(event.target)) {
        return;
      }

      if (panelRef.current?.contains(event.target)) {
        return;
      }

      closeMenu();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (submenuId != null) {
        event.preventDefault();
        setSubmenuId(null);
        return;
      }
      closeMenu();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMenu, menuOpen, submenuId]);

  if (!mounted || items.length === 0) {
    return null;
  }

  const submenuParent =
    submenuId != null ? items.find((item) => item.id === submenuId) : null;
  const submenuItems = submenuParent?.submenu;

  const menuPanel = menuOpen ? (
    <div
      ref={panelRef}
      id={menuId}
      className="entity-header-action-menu"
      data-entity-header-action-menu=""
      style={panelStyle}
      role="menu"
      aria-label={
        submenuParent
          ? `${submenuParent.label} options`
          : ariaLabel
      }
      onMouseDown={(event) => event.stopPropagation()}
    >
      {submenuParent && submenuItems ? (
        <div className="entity-header-action-menu__section">
          <button
            type="button"
            className="entity-header-action-menu__back"
            onClick={() => setSubmenuId(null)}
          >
            <ChevronLeftIcon size={14} />
            <span>{submenuParent.label}</span>
          </button>
          {submenuItems.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitemradio"
              aria-checked={Boolean(item.selected)}
              disabled={disabled || item.disabled}
              onClick={() => {
                if (item.onSelect() === false) return;
                closeMenu();
              }}
              className="entity-header-action-menu__item entity-header-action-menu__item--check"
            >
              <span
                className="entity-header-action-menu__check"
                aria-hidden="true"
              >
                {item.selected ? <CheckIcon size={14} /> : null}
              </span>
              <span className="entity-header-action-menu__label">
                {item.label}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="entity-header-action-menu__section">
          {items.map((item) => {
            const hasSubmenu = Boolean(item.submenu?.length);
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                disabled={disabled || item.disabled}
                onClick={() => {
                  if (hasSubmenu) {
                    setSubmenuId(item.id);
                    return;
                  }
                  if (item.onSelect() === false) return;
                  closeMenu();
                }}
                className={`entity-header-action-menu__item${
                  item.danger ? " entity-header-action-menu-item-danger" : ""
                }`}
              >
                {item.icon ? (
                  <span
                    className="entity-header-action-menu-item-icon"
                    aria-hidden="true"
                  >
                    {item.icon}
                  </span>
                ) : null}
                <span className="entity-header-action-menu__label">
                  {item.label}
                </span>
                {item.trailingLabel ? (
                  <span className="entity-header-action-menu__trailing">
                    {item.trailingLabel}
                  </span>
                ) : null}
                {hasSubmenu ? (
                  <span
                    className="entity-header-action-menu__chevron"
                    aria-hidden="true"
                  >
                    <ChevronRightIcon size={14} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  ) : null;

  return (
    <div
      className={`entity-header-actions-trigger-wrap${
        className ? ` ${className}` : ""
      }`}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={triggerAriaLabel}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-controls={menuOpen ? menuId : undefined}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
          setOpen(!menuOpen);
        }}
        onMouseDown={(event) => event.stopPropagation()}
        className={triggerClassName}
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

      {menuPanel ? createPortal(menuPanel, document.body) : null}
    </div>
  );
}

"use client";

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

export type EntityActionsMenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Optional leading 16px icon. */
  icon?: ReactNode;
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
  /** Optional leading content in the menu (unused by default). */
  children?: ReactNode;
};

/**
 * Three-dot overflow menu used by entity header actions (delete, etc.).
 * Portal-positioned panel aligned to the trigger.
 */
export function EntityActionsMenu({
  items,
  ariaLabel = "Actions",
  triggerAriaLabel = "More actions",
  disabled = false,
  className,
  triggerClassName = "entity-header-actions-trigger",
}: EntityActionsMenuProps) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const mounted = useMounted();
  const [menuOpen, setMenuOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({
    position: "fixed",
    visibility: "hidden",
  });

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
  }, [menuOpen, updatePanelPosition]);

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

      setMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  if (!mounted || items.length === 0) {
    return null;
  }

  const menuPanel = menuOpen ? (
    <div
      ref={panelRef}
      id={menuId}
      className="entity-header-action-menu"
      style={panelStyle}
      role="menu"
      aria-label={ariaLabel}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="app-side-panel-profile-menu-section">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            disabled={disabled || item.disabled}
            onClick={() => {
              setMenuOpen(false);
              item.onSelect();
            }}
            className={`app-side-panel-item app-side-panel-profile-menu-item${
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
            <span className="app-side-panel-item-label">{item.label}</span>
          </button>
        ))}
      </div>
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
          setMenuOpen((open) => !open);
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

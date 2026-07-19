"use client";

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

import { useEntityHeaderActionsContext } from "./entity-header-actions-context.js";
import { useMounted } from "./use-mounted.js";

const PANEL_GAP = 8;
const VIEWPORT_PADDING = 8;
const PANEL_MIN_WIDTH = 168;

export function EntityDeleteMenu() {
  const { deleteConfig, isDeletePending, openDeleteModal } =
    useEntityHeaderActionsContext();
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

  function handleMenuToggle() {
    setMenuOpen((open) => !open);
  }

  function handleDeleteClick() {
    setMenuOpen(false);
    openDeleteModal(deleteConfig);
  }

  const showTrigger = mounted && deleteConfig;

  const menuPanel =
    menuOpen && showTrigger ? (
      <div
        ref={panelRef}
        id={menuId}
        className="entity-header-action-menu"
        style={panelStyle}
        role="menu"
        aria-label="Entity actions"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="app-side-panel-profile-menu-section">
          <button
            type="button"
            role="menuitem"
            disabled={isDeletePending}
            onClick={handleDeleteClick}
            className="app-side-panel-item app-side-panel-profile-menu-item entity-header-action-menu-item-danger"
          >
            <span className="app-side-panel-item-label">Delete</span>
          </button>
        </div>
      </div>
    ) : null;

  return (
    <>
      <div className="entity-header-actions-trigger-wrap">
        {showTrigger ? (
          <button
            ref={triggerRef}
            type="button"
            aria-label="More actions"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-controls={menuOpen ? menuId : undefined}
            disabled={isDeletePending}
            onClick={handleMenuToggle}
            className="entity-header-actions-trigger"
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
        ) : null}
      </div>

      {menuPanel ? createPortal(menuPanel, document.body) : null}
    </>
  );
}

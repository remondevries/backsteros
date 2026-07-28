import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  ClipboardList,
  FileDiff,
  MessageCircle,
  Plus,
} from "lucide-react";
import {
  BrowserWindowIcon,
  KnowledgeBaseNavIcon,
  ProjectsSidePanelIcon,
} from "@backsteros/ui";

import {
  firstEnabledMenuIndex,
  moveEnabledMenuIndex,
  resolveAgentSurfaceAddMenuNavAction,
} from "../lib/agent/agent-surface-add-menu-shortcut";
import {
  listAgentSurfaceQuickOpenOptions,
  type AgentSurfaceQuickOpenKind,
} from "../lib/agent/agent-surface-quick-open-shortcut";
import {
  type AgentSurfaceTab,
  type AgentSurfaceTabKind,
} from "../lib/agent/agent-surface-tabs";
import { AgentSurfaceTabKindIcon } from "./agent-surface-tab-kind-icon";

function TabCloseIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 3l6 6M9 3L3 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

type AddMenuIcon = ComponentType<{
  className?: string;
  size?: number;
  strokeWidth?: number;
  "aria-hidden"?: boolean | "true" | "false";
}>;

const KIND_ICONS: Record<AgentSurfaceQuickOpenKind, AddMenuIcon> = {
  chat: MessageCircle,
  browser: BrowserWindowIcon,
  files: KnowledgeBaseNavIcon,
  plan: ClipboardList,
  diff: FileDiff,
};

export type DesktopAgentSurfaceTabBarProps = {
  tabs: AgentSurfaceTab[];
  activeId: string | null;
  cwdAvailable?: boolean;
  /** Files + Diff only appear for codebase projects. */
  isCodebaseProject?: boolean;
  /** Controlled add-menu open state (⌥T is handled by the parent when tabs exist). */
  addMenuOpen: boolean;
  onAddMenuOpenChange: (open: boolean) => void;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onAddSurface: (kind: AgentSurfaceTabKind) => void;
  onHide?: () => void;
};

export function DesktopAgentSurfaceTabBar({
  tabs,
  activeId,
  cwdAvailable = true,
  isCodebaseProject = false,
  addMenuOpen,
  onAddMenuOpenChange,
  onActivate,
  onClose,
  onAddSurface,
  onHide,
}: DesktopAgentSurfaceTabBarProps) {
  const canClose = tabs.length >= 1;
  const showAddButton = tabs.length > 0;
  const menuItems = useMemo(
    () =>
      listAgentSurfaceQuickOpenOptions(isCodebaseProject).map((option) => ({
        ...option,
        Icon: KIND_ICONS[option.kind],
      })),
    [isCodebaseProject],
  );
  const [highlightIndex, setHighlightIndex] = useState(0);
  const addWrapRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const highlightIndexRef = useRef(highlightIndex);
  highlightIndexRef.current = highlightIndex;
  const cwdAvailableRef = useRef(cwdAvailable);
  cwdAvailableRef.current = cwdAvailable;
  const menuItemsRef = useRef(menuItems);
  menuItemsRef.current = menuItems;
  const onAddSurfaceRef = useRef(onAddSurface);
  onAddSurfaceRef.current = onAddSurface;
  const onAddMenuOpenChangeRef = useRef(onAddMenuOpenChange);
  onAddMenuOpenChangeRef.current = onAddMenuOpenChange;

  const enabledFlags = useMemo(
    () => menuItems.map((item) => !(item.needsCwd && !cwdAvailable)),
    [cwdAvailable, menuItems],
  );

  useEffect(() => {
    if (!showAddButton && addMenuOpen) {
      onAddMenuOpenChange(false);
    }
  }, [addMenuOpen, onAddMenuOpenChange, showAddButton]);

  useEffect(() => {
    if (!addMenuOpen) return;
    setHighlightIndex(Math.max(0, firstEnabledMenuIndex(enabledFlags)));
  }, [addMenuOpen, enabledFlags]);

  useEffect(() => {
    if (!addMenuOpen || !showAddButton) return;

    const onPointerDown = (event: PointerEvent) => {
      const root = addWrapRef.current;
      if (!root || !(event.target instanceof Node)) return;
      if (!root.contains(event.target)) {
        onAddMenuOpenChangeRef.current(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const action = resolveAgentSurfaceAddMenuNavAction(event);
      if (action == null) return;

      event.preventDefault();
      event.stopPropagation();

      if (action === "dismiss") {
        onAddMenuOpenChangeRef.current(false);
        return;
      }

      const flags = menuItemsRef.current.map(
        (item) => !(item.needsCwd && !cwdAvailableRef.current),
      );
      if (action === "next" || action === "previous") {
        setHighlightIndex((current) =>
          moveEnabledMenuIndex(flags, current, action),
        );
        return;
      }

      if (action === "confirm") {
        const index = highlightIndexRef.current;
        const item = menuItemsRef.current[index];
        if (!item || (item.needsCwd && !cwdAvailableRef.current)) return;
        onAddSurfaceRef.current(item.kind);
        onAddMenuOpenChangeRef.current(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [addMenuOpen, showAddButton]);

  useEffect(() => {
    if (!addMenuOpen) return;
    itemRefs.current[highlightIndex]?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, addMenuOpen]);

  return (
    <div className="desktop-agent-surface-tab-bar">
      <div className="desktop-agent-surface-tab-cluster">
        <div
          className="desktop-agent-surface-tab-list"
          role="tablist"
          aria-label="Agent surface tabs"
        >
          <div className="desktop-agent-surface-tab-row">
            {tabs.map((tab) => {
              const active = tab.id === activeId;
              const closeLabel =
                tab.kind === "chat"
                  ? `Close ${tab.title} and end agent session`
                  : `Close ${tab.title}`;

              return (
                <div
                  key={tab.id}
                  className={`desktop-agent-surface-tab${
                    active ? " is-active" : ""
                  }`}
                  role="tab"
                  tabIndex={0}
                  aria-selected={active}
                  title={tab.title}
                  onClick={() => onActivate(tab.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onActivate(tab.id);
                    }
                  }}
                  onMouseDown={(event) => {
                    if (event.button === 1) event.preventDefault();
                  }}
                  onAuxClick={(event) => {
                    if (event.button === 1 && canClose) {
                      event.preventDefault();
                      event.stopPropagation();
                      onClose(tab.id);
                    }
                  }}
                >
                  <AgentSurfaceTabKindIcon kind={tab.kind} />
                  <span className="desktop-agent-surface-tab-label">
                    {tab.title}
                  </span>
                  {canClose ? (
                    <button
                      type="button"
                      className="desktop-agent-surface-tab-close"
                      aria-label={closeLabel}
                      title={closeLabel}
                      onClick={(event) => {
                        event.stopPropagation();
                        onClose(tab.id);
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      <TabCloseIcon />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {showAddButton ? (
          <div ref={addWrapRef} className="desktop-agent-surface-tab-add-wrap">
            <button
              type="button"
              className="desktop-agent-surface-tab-add"
              aria-label="Add panel surface"
              title="Add panel surface (⌥T)"
              aria-expanded={addMenuOpen}
              aria-haspopup="menu"
              onClick={() => onAddMenuOpenChange(!addMenuOpen)}
            >
              <Plus size={16} aria-hidden strokeWidth={2} />
            </button>
            {addMenuOpen ? (
              <div
                className="desktop-agent-surface-add-menu"
                role="menu"
                aria-label="Add surface"
              >
                {menuItems.map((item, index) => {
                  const disabled = item.needsCwd && !cwdAvailable;
                  const highlighted = index === highlightIndex;
                  const Icon = item.Icon;
                  return (
                    <button
                      key={item.kind}
                      ref={(node) => {
                        itemRefs.current[index] = node;
                      }}
                      type="button"
                      role="menuitem"
                      className={`desktop-agent-surface-add-menu__item${
                        highlighted ? " is-highlighted" : ""
                      }`}
                      disabled={disabled}
                      aria-disabled={disabled || undefined}
                      title={
                        disabled
                          ? "Available when a project working directory is set."
                          : item.label
                      }
                      onMouseEnter={() => {
                        if (!disabled) setHighlightIndex(index);
                      }}
                      onClick={() => {
                        if (disabled) return;
                        onAddSurface(item.kind);
                        onAddMenuOpenChange(false);
                      }}
                    >
                      <Icon size={14} aria-hidden strokeWidth={1.8} />
                      <span className="desktop-agent-surface-add-menu__label">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {onHide ? (
        <div className="desktop-agent-surface-tab-actions">
          <button
            type="button"
            className="desktop-agent-surface-tab desktop-agent-surface-tab--icon"
            onClick={onHide}
            title="Hide agent panel"
            aria-label="Hide agent panel"
          >
            <ProjectsSidePanelIcon size={16} collapsed={false} rail="end" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

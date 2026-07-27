import { useEffect, useRef, useState } from "react";
import {
  ClipboardList,
  FileDiff,
  Files,
  Globe2,
  MessageCircle,
  Plus,
  SquareTerminal,
} from "lucide-react";

import {
  type AgentSurfaceAddableKind,
  type AgentSurfaceTab,
  type AgentSurfaceTabKind,
} from "../lib/agent/agent-surface-tabs";

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

const ADD_MENU_ITEMS: {
  kind: AgentSurfaceAddableKind;
  label: string;
  description: string;
  Icon: typeof Globe2;
  needsCwd: boolean;
}[] = [
  {
    kind: "browser",
    label: "Browser",
    description: "Open a local app or URL.",
    Icon: Globe2,
    needsCwd: false,
  },
  {
    kind: "terminal",
    label: "Terminal",
    description: "Start a shell in this workspace.",
    Icon: SquareTerminal,
    needsCwd: true,
  },
  {
    kind: "files",
    label: "Files",
    description: "Browse and read workspace files.",
    Icon: Files,
    needsCwd: true,
  },
  {
    kind: "plan",
    label: "Plan",
    description: "Review the agent’s proposed plan.",
    Icon: ClipboardList,
    needsCwd: false,
  },
  {
    kind: "diff",
    label: "Diff",
    description: "Review changes from this turn.",
    Icon: FileDiff,
    needsCwd: false,
  },
];

function TabKindIcon({ kind }: { kind: AgentSurfaceTabKind }) {
  const className = "desktop-agent-surface-tab-icon";
  switch (kind) {
    case "terminal":
      return (
        <SquareTerminal className={className} size={12} aria-hidden strokeWidth={1.8} />
      );
    case "browser":
      return <Globe2 className={className} size={12} aria-hidden strokeWidth={1.8} />;
    case "files":
      return <Files className={className} size={12} aria-hidden strokeWidth={1.8} />;
    case "plan":
      return (
        <ClipboardList className={className} size={12} aria-hidden strokeWidth={1.8} />
      );
    case "diff":
      return <FileDiff className={className} size={12} aria-hidden strokeWidth={1.8} />;
    case "chat":
    default:
      return (
        <MessageCircle className={className} size={12} aria-hidden strokeWidth={1.8} />
      );
  }
}

export type DesktopAgentSurfaceTabBarProps = {
  tabs: AgentSurfaceTab[];
  activeId: string;
  cwdAvailable?: boolean;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onAddSurface: (kind: AgentSurfaceAddableKind) => void;
  onStopAgent?: () => void;
  onHide?: () => void;
};

export function DesktopAgentSurfaceTabBar({
  tabs,
  activeId,
  cwdAvailable = true,
  onActivate,
  onClose,
  onAddSurface,
  onStopAgent,
  onHide,
}: DesktopAgentSurfaceTabBarProps) {
  const canClose = tabs.length > 1;
  const [menuOpen, setMenuOpen] = useState(false);
  const addWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const root = addWrapRef.current;
      if (!root || !(event.target instanceof Node)) return;
      if (!root.contains(event.target)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [menuOpen]);

  return (
    <div className="desktop-agent-surface-tab-bar">
      <div
        className="desktop-agent-surface-tab-list"
        role="tablist"
        aria-label="Agent surface tabs"
      >
        {tabs.map((tab, index) => {
          const active = tab.id === activeId;
          const hasTabsToRight = index < tabs.length - 1;

          return (
            <div
              key={tab.id}
              className={`desktop-agent-surface-tab-width${
                active ? " is-active" : ""
              }`}
            >
              <div
                role="tab"
                tabIndex={0}
                aria-selected={active}
                title={tab.title}
                className={`desktop-agent-surface-tab${
                  active ? " is-active" : ""
                }${hasTabsToRight ? " has-border-right" : ""}`}
                onClick={() => onActivate(tab.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onActivate(tab.id);
                  }
                }}
                onMouseDown={(event) => {
                  if (event.button === 1) {
                    event.preventDefault();
                  }
                }}
                onAuxClick={(event) => {
                  if (event.button === 1 && canClose) {
                    event.preventDefault();
                    event.stopPropagation();
                    onClose(tab.id);
                  }
                }}
              >
                {active ? (
                  <span
                    className="desktop-agent-surface-tab-active-bar"
                    aria-hidden="true"
                  />
                ) : null}
                <TabKindIcon kind={tab.kind} />
                <span className="desktop-agent-surface-tab-label">
                  {tab.title}
                </span>
                {canClose ? (
                  <div className="desktop-agent-surface-tab-trailing">
                    <button
                      type="button"
                      className={`desktop-agent-surface-tab-close${
                        active ? " is-active-tab" : ""
                      }`}
                      aria-label={`Close ${tab.title}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onClose(tab.id);
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      <TabCloseIcon />
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div ref={addWrapRef} className="desktop-agent-surface-tab-add-wrap">
        <button
          type="button"
          className="desktop-agent-surface-tab-add"
          aria-label="Add panel surface"
          title="Add panel surface"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Plus size={14} aria-hidden strokeWidth={2} />
        </button>
        {menuOpen ? (
          <div
            className="desktop-agent-surface-add-menu"
            role="menu"
            aria-label="Add surface"
          >
            {ADD_MENU_ITEMS.map((item) => {
              const disabled = item.needsCwd && !cwdAvailable;
              const Icon = item.Icon;
              return (
                <button
                  key={item.kind}
                  type="button"
                  role="menuitem"
                  className="desktop-agent-surface-add-menu__item"
                  disabled={disabled}
                  title={
                    disabled
                      ? "Available when a project working directory is set."
                      : item.description
                  }
                  onClick={() => {
                    if (disabled) return;
                    onAddSurface(item.kind);
                    setMenuOpen(false);
                  }}
                >
                  <Icon size={14} aria-hidden strokeWidth={1.8} />
                  <span className="desktop-agent-surface-add-menu__text">
                    <span className="desktop-agent-surface-add-menu__label">
                      {item.label}
                    </span>
                    <span className="desktop-agent-surface-add-menu__desc">
                      {item.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {onStopAgent || onHide ? (
        <div className="desktop-agent-surface-tab-actions">
          {onStopAgent ? (
            <button
              type="button"
              className="desktop-agent-chat__stop"
              aria-label="Stop agent"
              title="Stop agent — end the ACP session and clear this task's agent chat"
              onClick={onStopAgent}
            >
              Stop
            </button>
          ) : null}
          {onHide ? (
            <button
              type="button"
              className="desktop-agent-chat__hide"
              onClick={onHide}
              title="Hide agent chat"
            >
              Hide
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

import { ProjectsSidePanelIcon } from "@backsteros/ui";

import {
  agentSurfaceQuickOpenHotkeyLabel,
  listAgentSurfaceQuickOpenOptions,
  type AgentSurfaceQuickOpenKind,
} from "../lib/agent/agent-surface-quick-open-shortcut";
import type { AgentSurfaceTab } from "../lib/agent/agent-surface-tabs";
import { AgentSurfaceTabKindIcon } from "./agent-surface-tab-kind-icon";

export type DesktopAgentCollapsedStripProps = {
  tabs: AgentSurfaceTab[];
  activeId: string | null;
  isCodebaseProject?: boolean;
  cwdAvailable?: boolean;
  chatAvailable?: boolean;
  onActivateTab: (id: string) => void;
  onOpenKind: (kind: AgentSurfaceQuickOpenKind) => void;
  onExpand: () => void;
};

/**
 * Narrow vertical strip shown while the agent panel is collapsed.
 * Reuses horizontal pill tab chrome (same classes/colors/icons), stood on end.
 * With no tabs, quick-open kinds show as dashed ghosts (⌘1–N still works).
 */
export function DesktopAgentCollapsedStrip({
  tabs,
  activeId,
  isCodebaseProject = false,
  cwdAvailable = true,
  chatAvailable = true,
  onActivateTab,
  onOpenKind,
  onExpand,
}: DesktopAgentCollapsedStripProps) {
  const hasOpenTabs = tabs.length > 0;
  const ghostOptions = listAgentSurfaceQuickOpenOptions(isCodebaseProject).filter(
    (option) => {
      if (option.kind === "chat") return chatAvailable;
      if (option.needsCwd) return cwdAvailable;
      return true;
    },
  );

  return (
    <div
      className="desktop-agent-collapsed-strip"
      role="toolbar"
      aria-label="Collapsed agent surfaces"
    >
      <button
        type="button"
        className="desktop-agent-surface-tab desktop-agent-surface-tab--icon"
        title="Show agent panel (])"
        aria-label="Show agent panel"
        onClick={onExpand}
      >
        <ProjectsSidePanelIcon size={16} collapsed rail="end" />
      </button>

      <div className="desktop-agent-collapsed-strip__tabs" role="tablist">
        {hasOpenTabs
          ? tabs.map((tab) => {
              const active = tab.id === activeId;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  className={`desktop-agent-surface-tab desktop-agent-surface-tab--vertical${
                    active ? " is-active" : ""
                  }`}
                  title={tab.title}
                  aria-label={`Show ${tab.title}`}
                  aria-selected={active}
                  onClick={() => {
                    onExpand();
                    onActivateTab(tab.id);
                  }}
                >
                  <AgentSurfaceTabKindIcon kind={tab.kind} />
                  <span className="desktop-agent-surface-tab-label">
                    {tab.title}
                  </span>
                </button>
              );
            })
          : ghostOptions.map((option) => {
              const hotkey = agentSurfaceQuickOpenHotkeyLabel(
                option.kind,
                isCodebaseProject,
              );
              return (
                <button
                  key={option.kind}
                  type="button"
                  className="desktop-agent-surface-tab desktop-agent-surface-tab--vertical is-ghost"
                  title={`${option.label}${hotkey ? ` (${hotkey})` : ""}`}
                  aria-label={`Open ${option.label}${
                    hotkey ? `, ${hotkey}` : ""
                  }`}
                  onClick={() => {
                    onExpand();
                    onOpenKind(option.kind);
                  }}
                >
                  <AgentSurfaceTabKindIcon kind={option.kind} />
                  <span className="desktop-agent-surface-tab-label">
                    {option.label}
                  </span>
                </button>
              );
            })}
      </div>
    </div>
  );
}

import {
  ClipboardList,
  FileDiff,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";
import {
  BrowserWindowIcon,
  KnowledgeBaseNavIcon,
} from "@backsteros/ui";

import {
  agentSurfaceQuickOpenHotkeyLabel,
  listAgentSurfaceQuickOpenOptions,
  type AgentSurfaceQuickOpenKind,
} from "../../lib/agent/agent-surface-quick-open-shortcut";

type PickerIcon =
  | LucideIcon
  | typeof BrowserWindowIcon
  | typeof KnowledgeBaseNavIcon;

const KIND_ICONS: Record<AgentSurfaceQuickOpenKind, PickerIcon> = {
  chat: MessageCircle,
  browser: BrowserWindowIcon,
  files: KnowledgeBaseNavIcon,
  plan: ClipboardList,
  diff: FileDiff,
};

export type AgentSurfaceEmptyPickerProps = {
  onAddSurface: (kind: AgentSurfaceQuickOpenKind) => void;
  cwdAvailable?: boolean;
  /** Chat/Agent can open a new agent session when start is wired. */
  chatAvailable?: boolean;
  /** Files + Diff only appear for codebase projects. */
  isCodebaseProject?: boolean;
  /** Diff only appears once the agent has produced file changes. */
  diffAvailable?: boolean;
};

export function AgentSurfaceEmptyPicker({
  onAddSurface,
  cwdAvailable = true,
  chatAvailable = true,
  isCodebaseProject = false,
  diffAvailable = false,
}: AgentSurfaceEmptyPickerProps) {
  const visibility = { isCodebaseProject, diffAvailable };
  const cards = listAgentSurfaceQuickOpenOptions(visibility).map((option) => {
    const available =
      option.kind === "chat"
        ? chatAvailable
        : option.needsCwd
          ? cwdAvailable
          : true;
    const disabledReason = !available
      ? option.kind === "chat"
        ? "Start an agent from Activities first."
        : "Available when a project working directory is set."
      : null;
    return {
      ...option,
      Icon: KIND_ICONS[option.kind],
      available,
      disabledReason,
      hotkey: agentSurfaceQuickOpenHotkeyLabel(option.kind, visibility),
    };
  });

  return (
    <div className="agent-surface-empty-picker">
      <div className="agent-surface-empty-picker__inner">
        <div className="agent-surface-empty-picker__header">
          <h3 className="agent-surface-empty-picker__title">Open a surface</h3>
        </div>
        <div className="agent-surface-empty-picker__grid">
          {cards.map((card) => {
            const Icon = card.Icon;
            return (
              <button
                key={card.kind}
                type="button"
                className={`agent-surface-empty-picker__card${
                  card.available ? "" : " is-disabled"
                }`}
                disabled={!card.available}
                title={
                  card.available
                    ? `${card.description} (${card.hotkey})`
                    : (card.disabledReason ?? card.description)
                }
                aria-label={
                  card.available
                    ? `${card.label} (${card.hotkey})`
                    : (card.disabledReason ?? card.label)
                }
                aria-disabled={!card.available}
                onClick={() => {
                  if (!card.available) return;
                  onAddSurface(card.kind);
                }}
              >
                <span
                  className="agent-surface-empty-picker__hotkey"
                  aria-hidden="true"
                >
                  {card.hotkey}
                </span>
                <Icon
                  className="agent-surface-empty-picker__icon"
                  size={28}
                  aria-hidden
                  strokeWidth={1.8}
                />
                <span className="agent-surface-empty-picker__label">
                  {card.label}
                </span>
                <span className="agent-surface-empty-picker__desc">
                  {card.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

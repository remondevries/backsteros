import { useCallback } from "react";
import {
  Bot,
  MessageCircleQuestion,
  PencilRuler,
  type LucideIcon,
} from "lucide-react";

import {
  cycleAgentChatMode,
  getAgentChatModeOption,
  readAgentChatMode,
  writeAgentChatMode,
  type AgentChatMode,
} from "../lib/agent/agent-chat-mode";

export type DesktopAgentModePickerProps = {
  disabled?: boolean;
  value?: AgentChatMode;
  onModeChange?: (mode: AgentChatMode) => void;
};

const MODE_ICONS: Record<AgentChatMode, LucideIcon> = {
  build: Bot,
  plan: PencilRuler,
  ask: MessageCircleQuestion,
};

/**
 * Active mode as plain colored icon + label (no chip background).
 * Click or Shift+Tab cycles Build → Plan → Ask.
 */
export function DesktopAgentModePicker({
  disabled = false,
  value,
  onModeChange,
}: DesktopAgentModePickerProps) {
  const selected = value ?? readAgentChatMode();
  const option = getAgentChatModeOption(selected);
  const Icon = MODE_ICONS[option.id];

  const cycle = useCallback(() => {
    if (disabled) return;
    const next = cycleAgentChatMode(selected, 1);
    writeAgentChatMode(next);
    onModeChange?.(next);
  }, [disabled, onModeChange, selected]);

  return (
    <button
      type="button"
      className={`desktop-agent-chat__mode-label is-${option.color}`}
      disabled={disabled}
      title={`${option.description} — click or ⇧Tab to cycle`}
      aria-label={`Agent mode: ${option.label}. Click or press Shift+Tab to cycle.`}
      onClick={cycle}
    >
      <Icon
        className="desktop-agent-chat__mode-label-icon"
        aria-hidden
        strokeWidth={1.9}
      />
      <span className="desktop-agent-chat__mode-label-text">{option.label}</span>
    </button>
  );
}

import { useCallback } from "react";
import { FilePenLine, Shield, ShieldOff } from "lucide-react";

import {
  cycleAgentChatAccessMode,
  getAgentChatAccessModeOption,
  type AgentChatAccessMode,
} from "../lib/agent/agent-chat-runtime-mode";

export type DesktopAgentAccessPickerProps = {
  disabled?: boolean;
  value: AgentChatAccessMode;
  onAccessModeChange?: (mode: AgentChatAccessMode) => void;
};

/**
 * Approval policy chip — Supervised / Auto-accept edits / Full access.
 * Distinct from Build/Ask/Plan interaction mode.
 */
export function DesktopAgentAccessPicker({
  disabled = false,
  value,
  onAccessModeChange,
}: DesktopAgentAccessPickerProps) {
  const option = getAgentChatAccessModeOption(value);
  const cycle = useCallback(() => {
    if (disabled) return;
    onAccessModeChange?.(cycleAgentChatAccessMode(value, 1));
  }, [disabled, onAccessModeChange, value]);

  const Icon =
    value === "full_access"
      ? ShieldOff
      : value === "auto_accept_edits"
        ? FilePenLine
        : Shield;

  return (
    <button
      type="button"
      className={`desktop-agent-chat__mode-label is-access is-${value.split("_").join("-")}`}
      disabled={disabled}
      title={`${option.description} — click to cycle`}
      aria-label={`Access: ${option.label}. Click to cycle.`}
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

"use client";

import { ChatPanelToggleOrb } from "./chat-panel-toggle-orb.js";

/** Inline Thinking Orb size (libraries.dev/orbs). */
const ORB_SIZE = 20;

export type ChatPanelToggleButtonProps = {
  collapsed: boolean;
  onToggle: () => void;
};

/**
 * Tabs-chrome control for the global right chat column — solving Thinking Orb
 * (https://libraries.dev/orbs). Keyboard chord is plain `]`.
 */
export function ChatPanelToggleButton({
  collapsed,
  onToggle,
}: ChatPanelToggleButtonProps) {
  const label = collapsed ? "Show chat panel" : "Hide chat panel";
  return (
    <button
      type="button"
      className={[
        "content-tabs-chat-toggle",
        collapsed ? "is-collapsed" : "is-expanded",
      ].join(" ")}
      aria-label={label}
      aria-pressed={!collapsed}
      title={`${label} (]) · A A toggles`}
      data-tauri-drag-region="false"
      onClick={onToggle}
    >
      <span className="content-tabs-chat-toggle__orb" aria-hidden="true">
        <ChatPanelToggleOrb size={ORB_SIZE} paused={collapsed} />
      </span>
    </button>
  );
}

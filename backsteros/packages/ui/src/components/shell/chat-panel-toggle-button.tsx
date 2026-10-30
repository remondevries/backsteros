"use client";

import { CommentDiscussionIcon } from "@primer/octicons-react";

export type ChatPanelToggleButtonProps = {
  collapsed: boolean;
  onToggle: () => void;
};

/**
 * Tabs-chrome control for the global right chat column (mirrors `[` for the
 * left nav; keyboard chord is plain `]`).
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
      title={`${label} (])`}
      data-tauri-drag-region="false"
      onClick={onToggle}
    >
      <CommentDiscussionIcon size={14} aria-hidden="true" />
    </button>
  );
}

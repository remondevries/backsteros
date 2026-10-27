"use client";

import { useMemo, type ReactNode } from "react";

import {
  INBOX_LIST_MODE_OPTIONS,
  type InboxListMode,
} from "../../inbox/inbox-list-mode.js";
import { EmailNavIcon, InboxNavIcon } from "../shell/sidebar-nav-icons.js";
import { AgentActivityIcon } from "../tasks/agent-activity-icon.js";
import {
  SegmentedPillToggle,
  type SegmentedPillToggleOption,
} from "../list-nav/list-board-view-shell.js";

const MODE_ICONS: Record<InboxListMode, ReactNode> = {
  notifications: <InboxNavIcon />,
  messages: <EmailNavIcon size={16} />,
  agents: <AgentActivityIcon size={16} />,
};

export type InboxSidePanelModeFooterProps = {
  mode: InboxListMode;
  onModeChange: (mode: InboxListMode) => void;
};

/** Notifications / Messages / Agents — calendar side-panel footer pattern. */
export function InboxSidePanelModeFooter({
  mode,
  onModeChange,
}: InboxSidePanelModeFooterProps) {
  const options = useMemo<SegmentedPillToggleOption<InboxListMode>[]>(
    () =>
      INBOX_LIST_MODE_OPTIONS.map((option) => ({
        ...option,
        icon: MODE_ICONS[option.value],
      })),
    [],
  );

  return (
    <div className="inbox-side-panel__footer">
      <SegmentedPillToggle
        value={mode}
        options={options}
        onChange={onModeChange}
        ariaLabel="Inbox list mode"
      />
    </div>
  );
}

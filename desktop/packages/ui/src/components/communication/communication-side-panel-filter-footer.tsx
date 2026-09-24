"use client";

import { useMemo, type ReactNode } from "react";
import {
  CommentDiscussionIcon,
  CommentIcon,
} from "@primer/octicons-react";

import {
  COMMUNICATION_LIST_FILTER_OPTIONS,
  type CommunicationListFilter,
} from "../../communication/communication.js";
import {
  CommunicationNavIcon,
  EmailNavIcon,
} from "../shell/sidebar-nav-icons.js";
import {
  SegmentedPillToggle,
  type SegmentedPillToggleOption,
} from "../list-nav/list-board-view-shell.js";

const FILTER_ICONS: Record<CommunicationListFilter, ReactNode> = {
  all: <CommunicationNavIcon size={16} />,
  email: <EmailNavIcon size={16} />,
  whatsapp: <CommentIcon size={16} />,
  chat: <CommentIcon size={16} />,
  support: <CommentDiscussionIcon size={16} />,
};

export type CommunicationSidePanelFilterFooterProps = {
  filter: CommunicationListFilter;
  onFilterChange: (filter: CommunicationListFilter) => void;
};

/** Everything / Email / Support — calendar side-panel footer pattern. */
export function CommunicationSidePanelFilterFooter({
  filter,
  onFilterChange,
}: CommunicationSidePanelFilterFooterProps) {
  const options = useMemo<
    SegmentedPillToggleOption<CommunicationListFilter>[]
  >(
    () =>
      COMMUNICATION_LIST_FILTER_OPTIONS.map((option) => ({
        ...option,
        icon: FILTER_ICONS[option.value],
      })),
    [],
  );

  return (
    <div className="communication-side-panel__footer">
      <SegmentedPillToggle
        value={filter}
        options={options}
        onChange={onFilterChange}
        ariaLabel="Communication list filter"
      />
    </div>
  );
}

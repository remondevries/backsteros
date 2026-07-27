"use client";

import type { ReactNode } from "react";

import { FloatingPillToggleDock } from "@/components/ui/floating-pill-toggle-dock";
import { SegmentedPillToggle } from "@/components/ui/segmented-pill-toggle";
import type { ListBoardView } from "@/lib/list-board-view";
import {
  LIST_BOARD_VIEW_BOARD_SHORTCUT_HINT,
  LIST_BOARD_VIEW_LIST_SHORTCUT_HINT,
} from "@/lib/shortcuts/list-board-view-shortcut";

const LIST_BOARD_TOGGLE_OPTIONS = [
  { value: "list", label: "List" },
  { value: "board", label: "Board" },
] as const;

type ListBoardViewShellProps = {
  view: ListBoardView;
  onViewChange: (view: ListBoardView) => void;
  ariaLabel?: string;
  listContent: ReactNode;
  boardContent: ReactNode;
};

/** Circle-style shell: list/board content with floating toggle docked bottom-right. */
export function ListBoardViewShell({
  view,
  onViewChange,
  ariaLabel = "View mode",
  listContent,
  boardContent,
}: ListBoardViewShellProps) {
  const isBoardView = view === "board";

  return (
    <div
      data-list-board-view
      className={`list-board-view-shell relative flex min-h-0 flex-1 flex-col overflow-hidden${
        isBoardView
          ? " list-board-view-shell--board"
          : " list-board-view-shell--list"
      }`}
    >
      {isBoardView ? (
        <div className="list-board-view-board flex min-h-0 flex-1 flex-col overflow-hidden">
          {boardContent}
        </div>
      ) : (
        <div className="list-board-view-list min-h-0 flex-1 overflow-auto">
          {listContent}
        </div>
      )}

      <FloatingPillToggleDock
        className="z-20"
        title={`List: ${LIST_BOARD_VIEW_LIST_SHORTCUT_HINT} · Board: ${LIST_BOARD_VIEW_BOARD_SHORTCUT_HINT}`}
      >
        <SegmentedPillToggle
          value={view}
          options={[...LIST_BOARD_TOGGLE_OPTIONS]}
          onChange={onViewChange}
          ariaLabel={ariaLabel}
        />
      </FloatingPillToggleDock>
    </div>
  );
}

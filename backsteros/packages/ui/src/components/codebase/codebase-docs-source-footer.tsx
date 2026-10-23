"use client";

import { useMemo } from "react";

import {
  CODEBASE_DOCS_SOURCE_MODE_OPTIONS,
  type CodebaseDocsSourceMode,
} from "../../codebase/codebase-docs-source-mode.js";
import {
  SegmentedPillToggle,
  type SegmentedPillToggleOption,
} from "../list-nav/list-board-view-shell.js";

export type CodebaseDocsSourceFooterProps = {
  mode: CodebaseDocsSourceMode;
  onModeChange: (mode: CodebaseDocsSourceMode) => void;
};

/** Repo / Local — inbox side-panel footer pattern for codebase Docs. */
export function CodebaseDocsSourceFooter({
  mode,
  onModeChange,
}: CodebaseDocsSourceFooterProps) {
  const options = useMemo<SegmentedPillToggleOption<CodebaseDocsSourceMode>[]>(
    () => [...CODEBASE_DOCS_SOURCE_MODE_OPTIONS],
    [],
  );

  return (
    <div className="console-docs-tree__footer">
      <SegmentedPillToggle
        value={mode}
        options={options}
        onChange={onModeChange}
        ariaLabel="Documentation source"
      />
    </div>
  );
}

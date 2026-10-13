"use client";

import { SegmentedPillToggle } from "../list-nav/list-board-view-shell.js";
import {
  HELP_ARTICLE_LIST_SCOPE_OPTIONS,
  type HelpArticleAudience,
} from "../../spaces/help-article-properties.js";

export type KnowledgeSidePanelScopeFooterProps = {
  scope: HelpArticleAudience;
  onScopeChange: (scope: HelpArticleAudience) => void;
};

/** Group / Individual list toggle — Support center side panel. */
export function KnowledgeSidePanelScopeFooter({
  scope,
  onScopeChange,
}: KnowledgeSidePanelScopeFooterProps) {
  return (
    <div className="knowledge-side-panel__footer">
      <SegmentedPillToggle
        value={scope}
        options={[...HELP_ARTICLE_LIST_SCOPE_OPTIONS]}
        onChange={onScopeChange}
        ariaLabel="Support article list"
      />
    </div>
  );
}

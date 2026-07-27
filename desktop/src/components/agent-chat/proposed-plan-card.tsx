/**
 * Proposed plan markdown card for agent chat.
 * Visual/behavior adapted from pingdotgg/t3code (MIT) ProposedPlanCard —
 * uses BacksterOS DocumentMarkdownPreview instead of t3 ChatMarkdown.
 */

import { useState } from "react";
import { DocumentMarkdownPreview } from "@backsteros/ui";
import { Copy, Download, Ellipsis } from "lucide-react";

import {
  buildCollapsedProposedPlanPreviewMarkdown,
  buildProposedPlanMarkdownFilename,
  downloadPlanAsTextFile,
  normalizePlanMarkdownForExport,
  proposedPlanTitle,
  stripDisplayedPlanMarkdown,
} from "../../lib/agent/t3-port/proposed-plan";

export function ProposedPlanCard({
  planMarkdown,
}: {
  planMarkdown: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const title = proposedPlanTitle(planMarkdown) ?? "Proposed plan";
  const lineCount = planMarkdown.split("\n").length;
  const canCollapse = planMarkdown.length > 900 || lineCount > 20;
  const displayed = stripDisplayedPlanMarkdown(planMarkdown);
  const collapsedPreview = canCollapse
    ? buildCollapsedProposedPlanPreviewMarkdown(planMarkdown, { maxLines: 10 })
    : null;
  const exportContents = normalizePlanMarkdownForExport(planMarkdown);
  const downloadFilename = buildProposedPlanMarkdownFilename(planMarkdown);

  const copyPlan = async () => {
    try {
      await navigator.clipboard.writeText(exportContents);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
    setMenuOpen(false);
  };

  const downloadPlan = () => {
    downloadPlanAsTextFile(downloadFilename, exportContents);
    setMenuOpen(false);
  };

  return (
    <section className="desktop-agent-chat__proposed-plan" aria-label="Proposed plan">
      <header className="desktop-agent-chat__proposed-plan-header">
        <div className="desktop-agent-chat__proposed-plan-heading">
          <span className="desktop-agent-chat__proposed-plan-badge">Plan</span>
          <p className="desktop-agent-chat__proposed-plan-title">{title}</p>
        </div>
        <div className="desktop-agent-chat__proposed-plan-menu">
          <button
            type="button"
            className="desktop-agent-chat__proposed-plan-menu-trigger"
            aria-label="Plan actions"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Ellipsis className="desktop-agent-chat__proposed-plan-menu-icon" />
          </button>
          {menuOpen ? (
            <div className="desktop-agent-chat__proposed-plan-menu-pop" role="menu">
              <button
                type="button"
                role="menuitem"
                className="desktop-agent-chat__proposed-plan-menu-item"
                onClick={() => void copyPlan()}
              >
                <Copy className="desktop-agent-chat__proposed-plan-menu-item-icon" />
                {copied ? "Copied!" : "Copy to clipboard"}
              </button>
              <button
                type="button"
                role="menuitem"
                className="desktop-agent-chat__proposed-plan-menu-item"
                onClick={downloadPlan}
              >
                <Download className="desktop-agent-chat__proposed-plan-menu-item-icon" />
                Download as markdown
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <div
        className={`desktop-agent-chat__proposed-plan-body${
          canCollapse && !expanded
            ? " desktop-agent-chat__proposed-plan-body--collapsed"
            : ""
        }`}
      >
        <div className="desktop-agent-chat__proposed-plan-md">
          <DocumentMarkdownPreview
            body={
              canCollapse && !expanded
                ? (collapsedPreview ?? displayed)
                : displayed
            }
          />
        </div>
        {canCollapse && !expanded ? (
          <div className="desktop-agent-chat__proposed-plan-fade" aria-hidden />
        ) : null}
      </div>

      {canCollapse ? (
        <div className="desktop-agent-chat__proposed-plan-footer">
          <button
            type="button"
            className="desktop-agent-chat__proposed-plan-expand"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Collapse plan" : "Expand plan"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

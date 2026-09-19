"use client";

import { XIcon } from "@primer/octicons-react";
import type { CSSProperties } from "react";

import {
  getTaskStatusLabel,
  isTaskStatus,
  migrateLegacyTaskStatus,
} from "../../tasks/task-status.js";
import { resolveTaskStatusColor } from "../../tasks/task-status-color.js";

export type ProjectUpdateRelatedTimelineItem = {
  id: string;
  title: string;
  /** Task key/number shown beside the title (e.g. LDP-12 or #12). */
  taskKey: string;
  /** Raw task status for the colored badge. */
  status?: string | null;
};

export type ProjectUpdateRelatedTimelineProps = {
  items: ProjectUpdateRelatedTimelineItem[];
  onOpenItem?: (id: string) => void;
  /** Remove a related task from the update (chip-style X on hover). */
  onRemoveItem?: (id: string) => void;
  /**
   * Where to render the status badge.
   * - `below` (default): under the title — used for Changelog
   * - `inline`: left of the task id (right of the rail) — used for Incident Timeline
   */
  statusPlacement?: "below" | "inline";
};

function statusBadgeLabel(status: string): string {
  return isTaskStatus(status)
    ? getTaskStatusLabel(status)
    : getTaskStatusLabel(migrateLegacyTaskStatus(status));
}

function statusBadgeStyle(status: string): CSSProperties {
  const color = resolveTaskStatusColor(migrateLegacyTaskStatus(status));
  return {
    background: color,
    color: "var(--background, #0a0a0a)",
  };
}

/**
 * Vertical timeline of related tasks under a project update body
 * (adapted from shadcn timeline-06 changelog layout).
 */
export function ProjectUpdateRelatedTimeline({
  items,
  onOpenItem,
  onRemoveItem,
  statusPlacement = "below",
}: ProjectUpdateRelatedTimelineProps) {
  if (items.length === 0) return null;

  const statusInline = statusPlacement === "inline";
  const canRemove = Boolean(onRemoveItem);

  return (
    <div className="project-updates__timeline" aria-label="Related tasks">
      <div className="project-updates__timeline-list">
        {items.map((item) => {
          const status = item.status?.trim() || null;
          const statusBadge =
            status != null ? (
              <span
                className={[
                  "project-updates__timeline-status",
                  statusInline
                    ? "project-updates__timeline-status--inline"
                    : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={statusBadgeStyle(status)}
              >
                {statusBadgeLabel(status)}
              </span>
            ) : null;

          const headingInner = (
            <>
              {statusInline ? statusBadge : null}
              <span className="project-updates__timeline-task-key">
                {item.taskKey}
              </span>
              <span className="project-updates__timeline-title">{item.title}</span>
            </>
          );

          const heading = (
            <div className="contact-detail-relationship-chip task-related-chip project-updates__timeline-heading-chip">
              {onOpenItem ? (
                <button
                  type="button"
                  className="contact-detail-chip project-updates__timeline-heading"
                  title={item.title}
                  onClick={() => onOpenItem(item.id)}
                >
                  {headingInner}
                </button>
              ) : (
                <span
                  className="contact-detail-chip contact-detail-chip--static project-updates__timeline-heading"
                  title={item.title}
                >
                  {headingInner}
                </span>
              )}
              {canRemove ? (
                <button
                  type="button"
                  className="contact-detail-split-chip__remove"
                  aria-label={`Remove ${item.title}`}
                  title="Remove"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onRemoveItem?.(item.id);
                  }}
                >
                  <XIcon size={10} />
                </button>
              ) : null}
            </div>
          );

          return (
            <div key={item.id} className="project-updates__timeline-item">
              <div className="project-updates__timeline-content">
                <span
                  className="project-updates__timeline-dot"
                  aria-hidden="true"
                />
                {heading}
                {!statusInline ? statusBadge : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

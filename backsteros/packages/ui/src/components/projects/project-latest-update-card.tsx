"use client";

import type { ProjectUpdate } from "@backsteros/contracts";

import {
  PROJECT_UPDATE_KIND_LABELS,
  PROJECT_UPDATE_STATUS_LABELS,
} from "../../projects/project-updates.js";
import { DocumentMarkdownPreview } from "../documents/document-markdown-preview.js";
import {
  ProjectUpdateKindIncidentIcon,
  ProjectUpdateKindMaintenanceIcon,
  ProjectUpdateKindUpdateIcon,
} from "./project-update-kind-icons.js";
import { ProjectUpdateSeverityDot } from "./project-update-severity-icons.js";
import {
  ProjectUpdateStatusInternalIcon,
  ProjectUpdateStatusOpenIcon,
  ProjectUpdateStatusPublishedIcon,
  ProjectUpdateStatusResolvedIcon,
} from "./project-update-status-icons.js";

export type ProjectLatestUpdateCardProps = {
  update: ProjectUpdate;
  /** Navigate to the Updates section (Linear "Update" / see-all). */
  onOpenUpdates?: () => void;
};

function formatUpdateDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function KindIcon({
  kind,
  size = 14,
}: {
  kind: ProjectUpdate["kind"];
  size?: number;
}) {
  if (kind === "incident") {
    return <ProjectUpdateKindIncidentIcon size={size} />;
  }
  if (kind === "maintenance") {
    return <ProjectUpdateKindMaintenanceIcon size={size} />;
  }
  return <ProjectUpdateKindUpdateIcon size={size} />;
}

function StatusIcon({
  status,
  size = 14,
}: {
  status: ProjectUpdate["status"];
  size?: number;
}) {
  if (status === "open") return <ProjectUpdateStatusOpenIcon size={size} />;
  if (status === "resolved") {
    return <ProjectUpdateStatusResolvedIcon size={size} />;
  }
  if (status === "published") {
    return <ProjectUpdateStatusPublishedIcon size={size} />;
  }
  return <ProjectUpdateStatusInternalIcon size={size} />;
}

/**
 * Linear-style “Latest update” card on the project overview.
 * Project updates have no author field in the API — show kind/status/date.
 */
export function ProjectLatestUpdateCard({
  update,
  onOpenUpdates,
}: ProjectLatestUpdateCardProps) {
  const dateLabel = formatUpdateDate(update.updatedAt || update.createdAt);
  const body = update.body.trim();
  const preview =
    body.length > 280 ? `${body.slice(0, 277).trimEnd()}…` : body;

  return (
    <section className="project-latest-update" aria-label="Latest update">
      <header className="project-latest-update__header">
        <h3 className="project-latest-update__title">Latest update</h3>
        {onOpenUpdates ? (
          <button
            type="button"
            className="project-latest-update__action"
            onClick={onOpenUpdates}
          >
            Update
          </button>
        ) : null}
      </header>

      <div className="project-latest-update__meta">
        <span
          className="project-latest-update__status"
          title={PROJECT_UPDATE_STATUS_LABELS[update.status]}
        >
          <StatusIcon status={update.status} />
          <span>{PROJECT_UPDATE_STATUS_LABELS[update.status]}</span>
        </span>
        <span className="project-latest-update__kind">
          <KindIcon kind={update.kind} />
          <span>{PROJECT_UPDATE_KIND_LABELS[update.kind]}</span>
          {update.severity ? (
            <ProjectUpdateSeverityDot severity={update.severity} size={8} />
          ) : null}
        </span>
        {dateLabel ? (
          <time
            className="project-latest-update__date"
            dateTime={update.updatedAt || update.createdAt}
          >
            {dateLabel}
          </time>
        ) : null}
      </div>

      {update.title.trim() ? (
        <p className="project-latest-update__headline">{update.title}</p>
      ) : null}

      {preview ? (
        <div className="project-latest-update__body">
          <DocumentMarkdownPreview body={preview} />
        </div>
      ) : null}
    </section>
  );
}

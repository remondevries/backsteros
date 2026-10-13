"use client";

import type { ProjectUpdateKind, ProjectUpdateSeverity } from "@backsteros/contracts";

import { ClientLink } from "../../shared/client-link.js";
import { PropertyDropdownNavigateRow } from "../dropdowns/property-dropdown-navigate-row.js";
import {
  ProjectUpdateKindIncidentIcon,
  ProjectUpdateKindMaintenanceIcon,
  ProjectUpdateKindUpdateIcon,
} from "../projects/project-update-kind-icons.js";
import { PROJECT_UPDATE_SEVERITY_COLORS } from "../projects/project-update-severity-icons.js";

export type TaskRelatedUpdateLink = {
  id: string;
  title: string;
  kind: ProjectUpdateKind;
  severity?: ProjectUpdateSeverity | null;
  href: string;
};

export type TaskRelatedUpdateLinksProps = {
  updates: readonly TaskRelatedUpdateLink[];
};

function UpdateKindIcon({
  kind,
  severity,
}: {
  kind: ProjectUpdateKind;
  severity?: ProjectUpdateSeverity | null;
}) {
  if (kind === "incident") {
    const color =
      severity != null
        ? PROJECT_UPDATE_SEVERITY_COLORS[severity]
        : PROJECT_UPDATE_SEVERITY_COLORS.degraded;
    return <ProjectUpdateKindIncidentIcon size={14} color={color} />;
  }
  if (kind === "maintenance") {
    return <ProjectUpdateKindMaintenanceIcon size={14} />;
  }
  return <ProjectUpdateKindUpdateIcon size={14} />;
}

/**
 * Read-only links to project update posts that reference this task
 * (reverse of update `relatedTaskIds`). Same navigate-row chrome as Project.
 */
export function TaskRelatedUpdateLinks({
  updates,
}: TaskRelatedUpdateLinksProps) {
  if (updates.length === 0) return null;

  return (
    <div className="task-related-update-links">
      {updates.map((update) => (
        <PropertyDropdownNavigateRow
          key={update.id}
          navigateHref={update.href}
          navigateLabel={`Open ${update.title}`}
        >
          <ClientLink
            href={update.href}
            className="property-dropdown-trigger property-dropdown-trigger--static task-related-update-links__chip"
            title={update.title}
            aria-label={update.title}
          >
            <span
              className="property-dropdown-trigger__icon"
              aria-hidden="true"
            >
              <UpdateKindIcon kind={update.kind} severity={update.severity} />
            </span>
            <span className="property-dropdown-trigger__label">
              {update.title}
            </span>
          </ClientLink>
        </PropertyDropdownNavigateRow>
      ))}
    </div>
  );
}

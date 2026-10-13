import type {
  ProjectUpdateKind,
  ProjectUpdateSeverity,
  ProjectUpdateStatus,
} from "@backsteros/contracts";
import {
  PROJECT_UPDATE_DEFAULT_SEVERITY,
  PROJECT_UPDATE_DEFAULT_STATUS,
  PROJECT_UPDATE_INCIDENT_STATUSES,
  PROJECT_UPDATE_SEVERITIES,
  PROJECT_UPDATE_VISIBILITY_STATUSES,
  coerceProjectUpdateStatusForKind,
  defaultProjectUpdateStatusForKind,
} from "@backsteros/contracts";

export const PROJECT_UPDATE_KIND_LABELS: Record<ProjectUpdateKind, string> = {
  update: "Update",
  incident: "Incident",
  maintenance: "Maintenance",
};

export const PROJECT_UPDATE_STATUS_LABELS: Record<ProjectUpdateStatus, string> =
  {
    internal: "Internal",
    published: "Published",
    open: "Open",
    resolved: "Resolved",
  };

export const PROJECT_UPDATE_SEVERITY_LABELS: Record<
  ProjectUpdateSeverity,
  string
> = {
  high_risk: "High Risk",
  degraded: "Degraded",
  low_risk: "Low Risk",
};

export { PROJECT_UPDATE_DEFAULT_STATUS as defaultProjectUpdateStatus };
export { PROJECT_UPDATE_DEFAULT_SEVERITY as defaultProjectUpdateSeverity };
export {
  coerceProjectUpdateStatusForKind,
  defaultProjectUpdateStatusForKind,
};

export const PROJECT_UPDATE_STATUS_OPTIONS = PROJECT_UPDATE_VISIBILITY_STATUSES.map(
  (status) => ({
    value: status,
    label: PROJECT_UPDATE_STATUS_LABELS[status],
  }),
);

export const PROJECT_UPDATE_INCIDENT_STATUS_OPTIONS =
  PROJECT_UPDATE_INCIDENT_STATUSES.map((status) => ({
    value: status,
    label: PROJECT_UPDATE_STATUS_LABELS[status],
  }));

export function projectUpdateStatusOptionsForKind(kind: ProjectUpdateKind) {
  return kind === "incident"
    ? PROJECT_UPDATE_INCIDENT_STATUS_OPTIONS
    : PROJECT_UPDATE_STATUS_OPTIONS;
}

export const PROJECT_UPDATE_SEVERITY_OPTIONS = PROJECT_UPDATE_SEVERITIES.map(
  (severity) => ({
    value: severity,
    label: PROJECT_UPDATE_SEVERITY_LABELS[severity],
  }),
);

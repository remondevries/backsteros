export type BacksterosProjectUpdateKind = "update" | "incident" | "maintenance";
export type BacksterosProjectUpdateStatus = "internal" | "published" | "open" | "resolved";
export type BacksterosProjectUpdateSeverity = "high_risk" | "degraded" | "low_risk";

export const PROJECT_UPDATE_KIND_LABELS: Record<BacksterosProjectUpdateKind, string> = {
  update: "Update",
  incident: "Incident",
  maintenance: "Maintenance",
};

export const PROJECT_UPDATE_STATUS_LABELS: Record<BacksterosProjectUpdateStatus, string> = {
  internal: "Internal",
  published: "Published",
  open: "Open",
  resolved: "Resolved",
};

export const PROJECT_UPDATE_SEVERITY_LABELS: Record<BacksterosProjectUpdateSeverity, string> = {
  high_risk: "High Risk",
  degraded: "Degraded",
  low_risk: "Low Risk",
};

export const PROJECT_UPDATE_SEVERITY_COLORS: Record<BacksterosProjectUpdateSeverity, string> = {
  low_risk: "#FFFFFF",
  degraded: "#FF9600",
  high_risk: "#EB5757",
};

export const PROJECT_UPDATE_DEFAULT_STATUS: BacksterosProjectUpdateStatus = "internal";
export const PROJECT_UPDATE_DEFAULT_INCIDENT_STATUS: BacksterosProjectUpdateStatus = "open";
export const PROJECT_UPDATE_DEFAULT_SEVERITY: BacksterosProjectUpdateSeverity = "degraded";

const VISIBILITY_STATUSES = [
  "internal",
  "published",
] as const satisfies readonly BacksterosProjectUpdateStatus[];
const INCIDENT_STATUSES = [
  "open",
  "resolved",
] as const satisfies readonly BacksterosProjectUpdateStatus[];

export function projectUpdateStatusesForKind(
  kind: BacksterosProjectUpdateKind,
): readonly BacksterosProjectUpdateStatus[] {
  return kind === "incident" ? INCIDENT_STATUSES : VISIBILITY_STATUSES;
}

export function defaultProjectUpdateStatusForKind(
  kind: BacksterosProjectUpdateKind,
): BacksterosProjectUpdateStatus {
  return kind === "incident"
    ? PROJECT_UPDATE_DEFAULT_INCIDENT_STATUS
    : PROJECT_UPDATE_DEFAULT_STATUS;
}

export function coerceProjectUpdateStatusForKind(
  kind: BacksterosProjectUpdateKind,
  status: string | null | undefined,
): BacksterosProjectUpdateStatus {
  const allowed = projectUpdateStatusesForKind(kind);
  if (status != null && (allowed as readonly string[]).includes(status)) {
    return status as BacksterosProjectUpdateStatus;
  }
  if (kind === "incident") {
    if (status === "published") return "resolved";
    if (status === "internal") return "open";
    return PROJECT_UPDATE_DEFAULT_INCIDENT_STATUS;
  }
  if (status === "resolved") return "published";
  if (status === "open") return "internal";
  return PROJECT_UPDATE_DEFAULT_STATUS;
}

export function isProjectUpdateKind(value: string): value is BacksterosProjectUpdateKind {
  return value === "update" || value === "incident" || value === "maintenance";
}

export function isProjectUpdateStatus(value: string): value is BacksterosProjectUpdateStatus {
  return value === "internal" || value === "published" || value === "open" || value === "resolved";
}

export function isProjectUpdateSeverity(
  value: string | null | undefined,
): value is BacksterosProjectUpdateSeverity {
  return value === "high_risk" || value === "degraded" || value === "low_risk";
}

import type { TaskStatus } from "../tasks/task-status.js";

/** Estimate workflow statuses (task-status icon mapping in parentheses). */
export const CLIENT_ESTIMATE_STATUSES = [
  "concept",
  "in_review",
  "approved",
  "declined",
] as const;

export type ClientEstimateStatus = (typeof CLIENT_ESTIMATE_STATUSES)[number];

export const CLIENT_ESTIMATE_STATUS_ORDER: readonly ClientEstimateStatus[] = [
  ...CLIENT_ESTIMATE_STATUSES,
];

export const CLIENT_ESTIMATE_STATUS_LABELS: Record<ClientEstimateStatus, string> =
  {
    concept: "Concept",
    in_review: "In Review",
    approved: "Approved",
    declined: "Declined",
  };

/** Map estimate status → task status icon model. */
export const CLIENT_ESTIMATE_STATUS_TASK_ICON: Record<
  ClientEstimateStatus,
  TaskStatus
> = {
  concept: "backlog",
  in_review: "in_review",
  approved: "completed",
  declined: "canceled",
};

const LEGACY: Record<string, ClientEstimateStatus> = {
  draft: "concept",
  published: "in_review",
  archived: "declined",
};

export function isClientEstimateStatus(
  value: string,
): value is ClientEstimateStatus {
  return (CLIENT_ESTIMATE_STATUSES as readonly string[]).includes(value);
}

export function migrateClientEstimateStatus(
  status: string | null | undefined,
): ClientEstimateStatus {
  if (!status) return "concept";
  if (isClientEstimateStatus(status)) return status;
  return LEGACY[status] ?? "concept";
}

export function getClientEstimateStatusLabel(
  status: ClientEstimateStatus,
): string {
  return CLIENT_ESTIMATE_STATUS_LABELS[status];
}

export function formatEstimateDisplayId(number: number | null | undefined): string {
  if (number == null || !Number.isFinite(number) || number <= 0) return "ES-?";
  return `ES-${Math.trunc(number)}`;
}

export type EstimateLikeForGrouping = {
  status: string;
  sortOrder?: number;
  updatedAt?: string | number | Date | null;
};

export type EstimateStatusGroup<
  T extends EstimateLikeForGrouping = EstimateLikeForGrouping,
> = {
  status: ClientEstimateStatus;
  label: string;
  estimates: T[];
};

export function groupEstimatesByStatus<T extends EstimateLikeForGrouping>(
  estimates: readonly T[],
  options?: { includeEmpty?: boolean },
): EstimateStatusGroup<T>[] {
  const buckets = new Map<ClientEstimateStatus, T[]>();
  for (const status of CLIENT_ESTIMATE_STATUS_ORDER) {
    buckets.set(status, []);
  }
  for (const estimate of estimates) {
    const status = migrateClientEstimateStatus(estimate.status);
    buckets.get(status)?.push(estimate);
  }
  const groups = CLIENT_ESTIMATE_STATUS_ORDER.map((status) => ({
    status,
    label: getClientEstimateStatusLabel(status),
    estimates: (buckets.get(status) ?? []).sort(
      (left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0),
    ),
  }));
  if (options?.includeEmpty) return groups;
  return groups.filter((group) => group.estimates.length > 0);
}

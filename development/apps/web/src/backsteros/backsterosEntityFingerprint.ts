/**
 * Cheap revision fingerprints for soft-poll change detection.
 * Prefer id + updatedAt (+ status when present) over full JSON.stringify.
 *
 * Status is included so a promote that bumps only `status` (before `updatedAt`
 * lands on a follow-up poll) still invalidates soft-poll skip. Optimistic
 * overlays in `pendingTaskStatus` keep soft-poll from regressing mid-flight.
 */

export function backsterosEntityListFingerprint(
  items: readonly {
    readonly id: string;
    readonly updatedAt: string;
    readonly status?: string;
  }[],
): string {
  if (items.length === 0) return "0";
  let out = String(items.length);
  for (const item of items) {
    out += `\0${item.id}:${item.updatedAt}:${item.status ?? ""}`;
  }
  return out;
}

export function backsterosTaskDetailRevisionFingerprint(input: {
  readonly taskId: string;
  readonly taskUpdatedAt: string;
  readonly assigneeId: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly status: string;
  readonly priority: number | null | undefined;
  readonly dueDate: string | null;
  readonly dueEndDate: string | null | undefined;
  readonly contactId: string | null;
  readonly relatedContactIds: readonly string[];
  readonly relatedOrganizationIds: readonly string[];
  readonly comments: readonly { readonly id: string; readonly updatedAt: string }[];
  readonly activities: readonly { readonly id: string; readonly createdAt: string }[];
}): string {
  return [
    input.taskId,
    input.taskUpdatedAt,
    input.assigneeId ?? "",
    input.title,
    input.description ?? "",
    input.status,
    input.priority ?? "",
    input.dueDate ?? "",
    input.dueEndDate ?? "",
    input.contactId ?? "",
    input.relatedContactIds.join(","),
    input.relatedOrganizationIds.join(","),
    backsterosEntityListFingerprint(input.comments),
    input.activities.length === 0
      ? "0"
      : `${input.activities.length}\0${input.activities.map((a) => `${a.id}:${a.createdAt}`).join("\0")}`,
  ].join("\n");
}

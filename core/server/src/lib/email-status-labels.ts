/**
 * AgentMail has no IMAP folders — status is mirrored as string labels on threads.
 * Names match desktop TASK_STATUS_LABELS so folders read the same in both UIs.
 */

export const EMAIL_STATUS_VALUES = [
  "triage",
  "backlog",
  "ready_to_start",
  "in_progress",
  "on_hold",
  "in_review",
  "completed",
  "canceled",
  "duplicated",
] as const;

export type EmailStatusValue = (typeof EMAIL_STATUS_VALUES)[number];

export const EMAIL_STATUS_LABELS: Record<EmailStatusValue, string> = {
  triage: "Triage",
  backlog: "Backlog",
  ready_to_start: "Ready to Start",
  in_progress: "In Progress",
  on_hold: "On Hold",
  in_review: "In Review",
  completed: "Completed",
  canceled: "Canceled",
  duplicated: "Duplicated",
};

export const EMAIL_STATUS_LABEL_NAMES: readonly string[] = EMAIL_STATUS_VALUES.map(
  (status) => EMAIL_STATUS_LABELS[status],
);

export function isEmailStatusValue(value: string): value is EmailStatusValue {
  return (EMAIL_STATUS_VALUES as readonly string[]).includes(value);
}

export function migrateLegacyEmailStatus(status: string): EmailStatusValue {
  switch (status) {
    case "todo":
      return "ready_to_start";
    case "done":
      return "completed";
    default:
      return isEmailStatusValue(status) ? status : "backlog";
  }
}

export function emailStatusLabelName(status: string): string {
  return EMAIL_STATUS_LABELS[migrateLegacyEmailStatus(status)];
}

/** Patch payload that moves a thread into exactly one status folder label. */
export function emailStatusLabelPatch(status: string): {
  addLabels: string[];
  removeLabels: string[];
} {
  const target = emailStatusLabelName(status);
  return {
    addLabels: [target],
    removeLabels: EMAIL_STATUS_LABEL_NAMES.filter((name) => name !== target),
  };
}

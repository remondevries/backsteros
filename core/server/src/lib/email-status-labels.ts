/**
 * AgentMail has no IMAP folders — status is mirrored as string labels on threads.
 * Names match desktop TASK_STATUS_LABELS so folders read the same in both UIs.
 */

/** Unsent AgentMail draft rows use this status in triage lists (E-number assigned). */
export const EMAIL_CONCEPT_STATUS = "concept" as const;

export const EMAIL_STATUS_VALUES = [
  "triage",
  "backlog",
  "ready_to_start",
  "in_progress",
  "on_hold",
  "waiting",
  "in_review",
  "completed",
  "canceled",
  "duplicated",
  EMAIL_CONCEPT_STATUS,
] as const;

export type EmailStatusValue = (typeof EMAIL_STATUS_VALUES)[number];

export const EMAIL_STATUS_LABELS: Record<EmailStatusValue, string> = {
  triage: "Triage",
  backlog: "Backlog",
  ready_to_start: "Ready to Start",
  in_progress: "In Progress",
  on_hold: "On Hold",
  waiting: "Waiting",
  in_review: "In Review",
  completed: "Completed",
  canceled: "Canceled",
  duplicated: "Duplicated",
  concept: "Concept",
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
    case EMAIL_CONCEPT_STATUS:
      return EMAIL_CONCEPT_STATUS;
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

/** Auto-promotions while the reply agent writes / finishes a draft. */
export type EmailWorkflowPromoteStatus = "in_progress" | "in_review";

/**
 * Whether a thread may auto-move into `next` (never downgrades past review /
 * completed / canceled / on_hold / concept).
 */
export function canPromoteEmailThreadWorkflowStatus(
  current: string,
  next: EmailWorkflowPromoteStatus,
): boolean {
  const status = migrateLegacyEmailStatus(current);
  if (status === next) return false;
  if (next === "in_progress") {
    return (
      status === "triage" ||
      status === "ready_to_start" ||
      status === "backlog"
    );
  }
  return (
    status === "triage" ||
    status === "ready_to_start" ||
    status === "backlog" ||
    status === "in_progress"
  );
}

/**
 * New inbound mail on a non-Triage thread should return it to Triage so the
 * fresh reply is obvious in the inbox.
 */
export function shouldRetriageEmailThreadOnInbound(
  current: string | null | undefined,
): boolean {
  const normalized = (current ?? "").trim();
  if (!normalized) return false;
  return migrateLegacyEmailStatus(normalized) !== "triage";
}

function parseInboundCursorTime(
  value: string | Date | number | null | undefined,
): number | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Whether `candidate` is a newer inbound than the stored cursor.
 * Equal ids never retriage. Prefer timestamps so a lagging list cannot move the
 * cursor backwards or bounce a thread twice (OS-188).
 */
export function isNewerInboundMessage(input: {
  storedId?: string | null;
  storedAt?: string | Date | number | null;
  candidateId?: string | null;
  candidateAt?: string | Date | number | null;
}): boolean {
  const nextId = input.candidateId?.trim() || "";
  if (!nextId) return false;
  const prevId = input.storedId?.trim() || "";
  if (prevId && nextId === prevId) return false;

  const nextAt = parseInboundCursorTime(input.candidateAt);
  const prevAt = parseInboundCursorTime(input.storedAt);

  if (prevAt != null) {
    if (nextAt == null) return false;
    return nextAt > prevAt;
  }

  // No stored timestamp: empty cursor → first sighting is newer; otherwise
  // require a candidate timestamp before treating a different id as newer.
  if (!prevId) return true;
  return nextAt != null;
}

/**
 * Waiting/Done must not bounce on a missed client reply that is older than
 * Remon's last sent message (or the time the thread entered Waiting).
 * Unknown inbound time → do not bounce.
 */
export function shouldBounceWaitingThreadOnInbound(input: {
  status?: string | null;
  inboundAt?: string | Date | number | null;
  /** Latest outbound/`sent` message time on the thread, when known. */
  lastOutboundAt?: string | Date | number | null;
  /** Fallback floor: when the thread entered Waiting/Done (e.g. updatedAt). */
  waitingEnteredAt?: string | Date | number | null;
}): boolean {
  const status = migrateLegacyEmailStatus((input.status ?? "").trim() || "triage");
  if (status !== "waiting" && status !== "completed") {
    return true;
  }
  const inboundAt = parseInboundCursorTime(input.inboundAt);
  if (inboundAt == null) return false;
  const floor =
    parseInboundCursorTime(input.lastOutboundAt) ??
    parseInboundCursorTime(input.waitingEnteredAt);
  if (floor == null) return true;
  return inboundAt > floor;
}

/** Parse inbound/outbound cursor times for forward-only writes (OS-188). */
export function parseEmailInboundCursorTime(
  value: string | Date | number | null | undefined,
): number | null {
  return parseInboundCursorTime(value);
}

/**
 * @deprecated Prefer {@link isNewerInboundMessage} (timestamp-aware).
 * Id-only fallback: different id counts as newer (no timestamp guard).
 */
export function isNewerInboundMessageId(
  stored: string | null | undefined,
  candidate: string | null | undefined,
): boolean {
  const next = candidate?.trim() || "";
  if (!next) return false;
  const prev = stored?.trim() || "";
  return next !== prev;
}

/** AgentMail outbound messages carry the `sent` label. */
export function isAgentMailOutboundMessage(labels: readonly string[] | null | undefined): boolean {
  return (labels ?? []).some(
    (label) => label.trim().toLowerCase() === "sent",
  );
}

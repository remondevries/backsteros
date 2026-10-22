/** Default chase window when moving a task to `waiting` without a follow-up. */
export const DEFAULT_WAITING_FOLLOW_UP_DAYS = 7;

export function defaultWaitingFollowUpDateIso(
  from: Date = new Date(),
  days: number = DEFAULT_WAITING_FOLLOW_UP_DAYS,
): string {
  const next = new Date(from.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

/**
 * Build a status patch for `waiting`. When no chase date is set yet, include a
 * default {@link followUpDate} (+7 days). Callers that already have a date omit
 * it so the existing value is kept.
 */
export function buildWaitingStatusPatch(input?: {
  currentFollowUpDate?: string | number | Date | null;
  now?: Date;
}): { status: "waiting"; followUpDate?: string } {
  const current = input?.currentFollowUpDate;
  if (current != null && current !== "") {
    return { status: "waiting" };
  }
  return {
    status: "waiting",
    followUpDate: defaultWaitingFollowUpDateIso(input?.now),
  };
}

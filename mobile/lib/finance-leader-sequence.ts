/** Matches desktop `@backsteros/ui` finance-leader-sequence-gate (F then letter). */
export const FINANCE_LEADER_SEQUENCE_TIMEOUT_MS = 1000;

let lastFinanceLeaderKeyPressAt = 0;

export function registerFinanceLeaderKeyPress(): void {
  lastFinanceLeaderKeyPressAt = Date.now();
}

export function isFinanceLeaderSequencePending(): boolean {
  if (lastFinanceLeaderKeyPressAt === 0) {
    return false;
  }
  return (
    Date.now() - lastFinanceLeaderKeyPressAt <
    FINANCE_LEADER_SEQUENCE_TIMEOUT_MS
  );
}

export function clearFinanceLeaderSequence(): void {
  lastFinanceLeaderKeyPressAt = 0;
}

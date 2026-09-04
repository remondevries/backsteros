export const FINANCE_LEADER_SEQUENCE_TIMEOUT_MS = 1000;
let lastFinanceLeaderKeyPressAt = 0;
export function registerFinanceLeaderKeyPress() {
    lastFinanceLeaderKeyPressAt = Date.now();
}
export function isFinanceLeaderSequencePending() {
    if (lastFinanceLeaderKeyPressAt === 0) {
        return false;
    }
    return (Date.now() - lastFinanceLeaderKeyPressAt <
        FINANCE_LEADER_SEQUENCE_TIMEOUT_MS);
}
export function clearFinanceLeaderSequence() {
    lastFinanceLeaderKeyPressAt = 0;
}

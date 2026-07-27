export const GO_NAVIGATION_SEQUENCE_TIMEOUT_MS = 1000;

let lastGoLeaderKeyPressAt = 0;

export function registerGoLeaderKeyPress(): void {
  lastGoLeaderKeyPressAt = Date.now();
}

export function isGoLeaderSequencePending(): boolean {
  if (lastGoLeaderKeyPressAt === 0) {
    return false;
  }

  return (
    Date.now() - lastGoLeaderKeyPressAt < GO_NAVIGATION_SEQUENCE_TIMEOUT_MS
  );
}

export function clearGoLeaderSequence(): void {
  lastGoLeaderKeyPressAt = 0;
}

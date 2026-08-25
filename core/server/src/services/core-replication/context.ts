let applyingDepth = 0;

export function isApplyingReplication(): boolean {
  return applyingDepth > 0;
}

export async function withReplicationApply<T>(fn: () => Promise<T>): Promise<T> {
  applyingDepth += 1;
  try {
    return await fn();
  } finally {
    applyingDepth -= 1;
  }
}

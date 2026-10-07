/**
 * In-process rate gate for Zernio HTTP calls.
 * Limits: 60 / 600 / 1,200 req/min by account count; analytics 6 / 10 / 20 req/s.
 */

export type ZernioRateTier = "small" | "medium" | "large";

export function rateTierForAccountCount(accountCount: number): {
  generalPerMinute: number;
  analyticsPerSecond: number;
  tier: ZernioRateTier;
} {
  if (accountCount <= 2) {
    return { generalPerMinute: 60, analyticsPerSecond: 6, tier: "small" };
  }
  if (accountCount <= 2000) {
    return { generalPerMinute: 600, analyticsPerSecond: 10, tier: "medium" };
  }
  return { generalPerMinute: 1200, analyticsPerSecond: 20, tier: "large" };
}

type GateState = {
  generalTimestamps: number[];
  analyticsTimestamps: number[];
  accountCount: number;
  chain: Promise<unknown>;
};

const gates = new Map<string, GateState>();

function getGate(key: string): GateState {
  let gate = gates.get(key);
  if (!gate) {
    gate = {
      generalTimestamps: [],
      analyticsTimestamps: [],
      accountCount: 0,
      chain: Promise.resolve(),
    };
    gates.set(key, gate);
  }
  return gate;
}

function prune(timestamps: number[], windowMs: number, now: number): number[] {
  const cutoff = now - windowMs;
  return timestamps.filter((t) => t > cutoff);
}

async function waitForSlot(
  timestamps: number[],
  limit: number,
  windowMs: number,
): Promise<void> {
  for (;;) {
    const now = Date.now();
    const live = prune(timestamps, windowMs, now);
    timestamps.length = 0;
    timestamps.push(...live);
    if (timestamps.length < limit) {
      timestamps.push(now);
      return;
    }
    const oldest = timestamps[0] ?? now;
    const waitMs = Math.max(5, oldest + windowMs - now + 1);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

export function setZernioAccountCount(workspaceKey: string, count: number): void {
  getGate(workspaceKey).accountCount = Math.max(0, count);
}

export function enqueueZernioRequest<T>(
  workspaceKey: string,
  fn: () => Promise<T>,
  options?: { analytics?: boolean },
): Promise<T> {
  const gate = getGate(workspaceKey);
  const run = gate.chain.then(async () => {
    const { generalPerMinute, analyticsPerSecond } = rateTierForAccountCount(
      gate.accountCount,
    );
    if (options?.analytics) {
      await waitForSlot(gate.analyticsTimestamps, analyticsPerSecond, 1000);
    }
    await waitForSlot(gate.generalTimestamps, generalPerMinute, 60_000);
    return fn();
  }, async () => {
    const { generalPerMinute, analyticsPerSecond } = rateTierForAccountCount(
      gate.accountCount,
    );
    if (options?.analytics) {
      await waitForSlot(gate.analyticsTimestamps, analyticsPerSecond, 1000);
    }
    await waitForSlot(gate.generalTimestamps, generalPerMinute, 60_000);
    return fn();
  });
  gate.chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Test helper — clears in-memory gates. */
export function clearZernioRequestGates(): void {
  gates.clear();
}

/**
 * Round 4 one-off dead-letter cleanup plan (see
 * scripts/retry-meeting-dead-letters-and-ack-rest.ts).
 *
 * Retry only the named meeting rows (apply the stored payload); acknowledge
 * every other open dead letter without applying it. Pure planning + an
 * executor with injected side effects so it is testable without a database.
 */

/** The only row ids that are retried; everything else open is acknowledged. */
export const RETRY_MEETING_ROW_IDS: readonly string[] = [
  "12d3b2edd1c74e13bd819580e1e5fb54",
  "62baf908e05b46b0b519cd3a44b34ceb",
  "tjOOjQZQMd-fd3V6HQvds",
  "EjscGQPOsPzgIkQYVnMfa",
  "lFgsQ_VnWiew-g1r3RIMp",
];

export type OpenDeadLetterRef = {
  id: string;
  tableName: string;
  rowId: string;
  direction: string;
};

export type DeadLetterCleanupPlan = {
  retry: OpenDeadLetterRef[];
  acknowledge: OpenDeadLetterRef[];
  /** Requested meeting row ids that have no open dead letter right now. */
  retryRowIdsWithoutOpenLetter: string[];
};

export function planDeadLetterCleanup(
  open: readonly OpenDeadLetterRef[],
  retryRowIds: readonly string[] = RETRY_MEETING_ROW_IDS,
): DeadLetterCleanupPlan {
  const retrySet = new Set(retryRowIds);
  const retry: OpenDeadLetterRef[] = [];
  const acknowledge: OpenDeadLetterRef[] = [];
  for (const letter of open) {
    if (letter.tableName === "meetings" && retrySet.has(letter.rowId)) {
      retry.push(letter);
    } else {
      acknowledge.push(letter);
    }
  }
  const seen = new Set(retry.map((letter) => letter.rowId));
  return {
    retry,
    acknowledge,
    retryRowIdsWithoutOpenLetter: retryRowIds.filter((id) => !seen.has(id)),
  };
}

export type DeadLetterCleanupDeps = {
  retryById: (id: string) => Promise<{ status: string }>;
  acknowledgeById: (id: string) => Promise<{ status: string }>;
};

export type DeadLetterCleanupResult = {
  retried: Array<{ letter: OpenDeadLetterRef; status: string }>;
  acknowledged: Array<{ letter: OpenDeadLetterRef; status: string }>;
};

/**
 * Retries first, then acknowledges. A letter whose retry fails stays open (it
 * is never acknowledged by this run).
 */
export async function executeDeadLetterCleanup(
  plan: DeadLetterCleanupPlan,
  deps: DeadLetterCleanupDeps,
): Promise<DeadLetterCleanupResult> {
  const retried: DeadLetterCleanupResult["retried"] = [];
  for (const letter of plan.retry) {
    const result = await deps.retryById(letter.id);
    retried.push({ letter, status: result.status });
  }
  const acknowledged: DeadLetterCleanupResult["acknowledged"] = [];
  for (const letter of plan.acknowledge) {
    const result = await deps.acknowledgeById(letter.id);
    acknowledged.push({ letter, status: result.status });
  }
  return { retried, acknowledged };
}

export type CleanupCliArgs = { confirmCloud: boolean };

export function parseCleanupArgs(argv: readonly string[]): CleanupCliArgs {
  let confirmCloud = false;
  for (const arg of argv) {
    if (arg === "--confirm-cloud") {
      confirmCloud = true;
    } else if (arg === "--") {
      continue;
    } else {
      throw new Error(`unknown argument: ${arg} (only --confirm-cloud is supported)`);
    }
  }
  return { confirmCloud };
}

/** host/db only — never print credentials. */
export function describeDatabaseTarget(databaseUrl: string | undefined): string {
  if (!databaseUrl) return "<DATABASE_URL not set>";
  try {
    const url = new URL(databaseUrl);
    return `${url.host}${url.pathname}`;
  } catch {
    return "<unparseable DATABASE_URL>";
  }
}

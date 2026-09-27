/** Budget cadence options for project billing rows. */
export const PROJECT_BUDGET_PERIODS = [
  "monthly",
  "weekly",
  "quarterly",
] as const;

export type ProjectBudgetPeriod = (typeof PROJECT_BUDGET_PERIODS)[number];

export type ProjectBudgetEntry = {
  period: ProjectBudgetPeriod;
  /** Amount in euro cents. */
  amountCents: number;
};

/** Loose input when reading from API / PowerSync / editor drafts. */
export type ProjectBudgetInput =
  | ProjectBudgetEntry
  | {
      period?: string | null;
      amountCents?: number | null;
      amount?: number | null;
    };

export const PROJECT_BUDGET_PERIOD_LABELS: Record<ProjectBudgetPeriod, string> =
  {
    monthly: "Monthly",
    weekly: "Weekly",
    quarterly: "Quarterly",
  };

export function isProjectBudgetPeriod(
  value: string,
): value is ProjectBudgetPeriod {
  return (PROJECT_BUDGET_PERIODS as readonly string[]).includes(value);
}

export function normalizeProjectBudgetPeriod(
  value: string | null | undefined,
): ProjectBudgetPeriod {
  const normalized = value?.trim().toLowerCase() ?? "";
  return isProjectBudgetPeriod(normalized) ? normalized : "monthly";
}

export function getProjectBudgetPeriodLabel(
  period: ProjectBudgetPeriod,
): string {
  return PROJECT_BUDGET_PERIOD_LABELS[period];
}

function coerceBudgetEntriesList(
  budgets: unknown,
): readonly ProjectBudgetInput[] {
  if (budgets == null) return [];
  if (Array.isArray(budgets)) return budgets as ProjectBudgetInput[];
  if (typeof budgets === "string") {
    const trimmed = budgets.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return Array.isArray(parsed) ? (parsed as ProjectBudgetInput[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function coerceProjectBudgetEntry(
  entry: ProjectBudgetInput | null | undefined,
): ProjectBudgetEntry | null {
  if (entry == null || typeof entry !== "object") return null;
  const amountRaw =
    "amountCents" in entry && entry.amountCents != null
      ? entry.amountCents
      : "amount" in entry
        ? entry.amount
        : null;
  if (typeof amountRaw !== "number" || !Number.isFinite(amountRaw)) {
    return null;
  }
  const amountCents = Math.round(amountRaw);
  if (amountCents <= 0) return null;
  return {
    period: normalizeProjectBudgetPeriod(
      "period" in entry ? entry.period : undefined,
    ),
    amountCents,
  };
}

export function coerceProjectBudgetEntries(
  budgets: readonly ProjectBudgetInput[] | string | null | undefined,
): ProjectBudgetEntry[] {
  const list = coerceBudgetEntriesList(budgets);
  if (!list.length) return [];
  const out: ProjectBudgetEntry[] = [];
  for (const entry of list) {
    const coerced = coerceProjectBudgetEntry(entry);
    if (coerced) out.push(coerced);
  }
  return out;
}

/**
 * Editor rows always include at least one empty draft so the chips UI can
 * show a type + value placeholder (same pattern as contact emails).
 */
export function projectBudgetRowsForEditor(
  budgets: readonly ProjectBudgetInput[] | string | null | undefined,
): Array<{ period: ProjectBudgetPeriod; amountCents: number | null }> {
  const entries = coerceProjectBudgetEntries(budgets);
  if (entries.length === 0) {
    return [{ period: "monthly", amountCents: null }];
  }
  return entries.map((entry) => ({
    period: entry.period,
    amountCents: entry.amountCents,
  }));
}

/** Drop empty drafts before persisting. At most one budget row is kept. */
export function normalizeProjectBudgetEntries(
  rows: readonly {
    period?: string | null;
    amountCents?: number | null;
  }[],
): ProjectBudgetEntry[] {
  const out: ProjectBudgetEntry[] = [];
  for (const row of rows) {
    const amountCents =
      typeof row.amountCents === "number" && Number.isFinite(row.amountCents)
        ? Math.round(row.amountCents)
        : null;
    if (amountCents == null || amountCents <= 0) continue;
    out.push({
      period: normalizeProjectBudgetPeriod(row.period),
      amountCents,
    });
    break;
  }
  return out;
}

/**
 * Spend for tracked seconds at an hourly rate (both in cents / seconds).
 * Returns null when rate is unset.
 */
export function projectSpendCentsFromTrackedSeconds(
  trackedSeconds: number,
  hourlyRateCents: number | null | undefined,
): number | null {
  if (
    hourlyRateCents == null ||
    !Number.isFinite(hourlyRateCents) ||
    hourlyRateCents <= 0
  ) {
    return null;
  }
  const seconds = Math.max(0, trackedSeconds);
  if (seconds <= 0) return 0;
  return Math.round((seconds * hourlyRateCents) / 3600);
}

/**
 * Convert a budget amount between cadences via an average-month base
 * (12 months ≈ 52 weeks; quarter = 3 months).
 */
export function convertProjectBudgetAmountCents(
  amountCents: number,
  from: ProjectBudgetPeriod,
  to: ProjectBudgetPeriod,
): number {
  if (from === to) return Math.round(amountCents);
  const monthly =
    from === "monthly"
      ? amountCents
      : from === "weekly"
        ? (amountCents * 52) / 12
        : amountCents / 3;
  const target =
    to === "monthly"
      ? monthly
      : to === "weekly"
        ? (monthly * 12) / 52
        : monthly * 3;
  return Math.max(0, Math.round(target));
}

/**
 * Budget for a report range. Prefers an exact cadence match; otherwise
 * converts from the project’s single stored budget (e.g. monthly → weekly).
 */
export function projectBudgetForPeriod(
  budgets:
    | readonly ProjectBudgetEntry[]
    | readonly ProjectBudgetInput[]
    | string
    | null
    | undefined,
  periodKind: "month" | "week" | "quarter" | string,
): ProjectBudgetEntry | null {
  const want: ProjectBudgetPeriod | null =
    periodKind === "month"
      ? "monthly"
      : periodKind === "week"
        ? "weekly"
        : periodKind === "quarter"
          ? "quarterly"
          : null;
  if (!want) return null;

  const entries = coerceProjectBudgetEntries(budgets);
  if (entries.length === 0) return null;

  const exact = entries.find((entry) => entry.period === want);
  if (exact) return exact;

  const source = entries[0];
  if (!source || source.amountCents <= 0) return null;

  return {
    period: want,
    amountCents: convertProjectBudgetAmountCents(
      source.amountCents,
      source.period,
      want,
    ),
  };
}

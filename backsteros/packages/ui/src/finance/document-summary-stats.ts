/** One billable document line used for month totals / top-customer share. */
export type DocumentSummaryLine = {
  id: string;
  /** Prefer `YYYY-MM-DD` (or prefix thereof). */
  date: string | null | undefined;
  amountCents: number;
  customerKey: string;
  customerLabel: string;
};

export type CustomerShareSegment = {
  key: string;
  label: string;
  amountCents: number;
  /** 0–1 share of the total among included segments. */
  share: number;
  color: string;
};

const CUSTOMER_SHARE_COLORS = [
  "#3171de",
  "#3f9d6e",
  "#c9842b",
  "#606acc",
  "#db6d28",
  "#8b5cf6",
] as const;

/** `YYYY-MM` for the given local date (defaults to today). */
export function calendarMonthKey(asOf: Date = new Date()): string {
  return `${asOf.getFullYear()}-${String(asOf.getMonth() + 1).padStart(2, "0")}`;
}

/** Previous calendar month key relative to `asOf`. */
export function previousCalendarMonthKey(asOf: Date = new Date()): string {
  const prior = new Date(asOf.getFullYear(), asOf.getMonth() - 1, 1);
  return calendarMonthKey(prior);
}

export function monthKeyFromDocumentDate(
  value: string | null | undefined,
): string | null {
  if (!value?.trim()) return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  return `${match[1]}-${match[2]}`;
}

/** Parse Moneybird amount strings (e.g. `"12500.00"`) into integer cents. */
export function parseMoneyAmountToCents(
  amount: string | null | undefined,
): number {
  if (!amount?.trim()) return 0;
  const normalized = amount.trim().replace(",", ".");
  const euros = Number(normalized);
  if (!Number.isFinite(euros)) return 0;
  return Math.round(euros * 100);
}

export function sumAmountForMonth(
  lines: readonly DocumentSummaryLine[],
  monthKey: string,
): number {
  let total = 0;
  for (const line of lines) {
    if (monthKeyFromDocumentDate(line.date) !== monthKey) continue;
    if (!Number.isFinite(line.amountCents) || line.amountCents <= 0) continue;
    total += line.amountCents;
  }
  return total;
}

export function buildTopCustomerShares(
  lines: readonly DocumentSummaryLine[],
  options?: {
    /** Keep at most this many customers (no “Other” bucket). */
    limit?: number;
    /** When set, only include lines whose date falls in this calendar year. */
    year?: number | null;
  },
): CustomerShareSegment[] {
  const limit = Math.max(1, options?.limit ?? 3);
  const year = options?.year;
  const totals = new Map<string, { label: string; amountCents: number }>();

  for (const line of lines) {
    if (!Number.isFinite(line.amountCents) || line.amountCents <= 0) continue;
    if (year != null) {
      const month = monthKeyFromDocumentDate(line.date);
      if (!month || !month.startsWith(`${year}-`)) continue;
    }
    const key = line.customerKey.trim() || "unknown";
    const label = line.customerLabel.trim() || "Unknown";
    const existing = totals.get(key);
    if (existing) {
      existing.amountCents += line.amountCents;
    } else {
      totals.set(key, { label, amountCents: line.amountCents });
    }
  }

  const top = [...totals.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort(
      (a, b) =>
        b.amountCents - a.amountCents || a.label.localeCompare(b.label),
    )
    .slice(0, limit);

  if (top.length === 0) return [];

  const total = top.reduce((sum, row) => sum + row.amountCents, 0);
  if (total <= 0) return [];

  return top.map((row, index) => ({
    key: row.key,
    label: row.label,
    amountCents: row.amountCents,
    share: row.amountCents / total,
    color: CUSTOMER_SHARE_COLORS[index % CUSTOMER_SHARE_COLORS.length]!,
  }));
}

/**
 * Prefer an authoritative monthly series (e.g. Moneybird revenue months) when
 * present; otherwise fall back to summing document lines.
 */
export function resolveMonthTotalCents(options: {
  monthKey: string;
  lines: readonly DocumentSummaryLine[];
  seriesMonths?: ReadonlyArray<{ month: string; incomeCents: number }> | null;
}): number {
  const fromSeries = options.seriesMonths?.find(
    (row) => row.month === options.monthKey,
  )?.incomeCents;
  if (typeof fromSeries === "number" && Number.isFinite(fromSeries)) {
    return Math.max(0, fromSeries);
  }
  return sumAmountForMonth(options.lines, options.monthKey);
}

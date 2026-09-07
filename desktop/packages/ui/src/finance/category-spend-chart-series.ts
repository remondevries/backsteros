import type {
  FinancialCategory,
  FinancialTransaction,
} from "@backsteros/contracts";
import { isBalanceAffectingFinancialSettlement } from "@backsteros/contracts";

import { ENTITY_ICON_COLOR_PRESETS } from "../entity/entity-icon.js";

/** Stable key for spend booked directly on the parent (not a subcategory). */
export const CATEGORY_SPEND_DIRECT_KEY = "__direct__";

export type CategorySpendMonthInput = {
  /** YYYY-MM */
  month: string;
};

export type CategorySpendBarRow = {
  month: string;
  monthLabel: string;
} & Record<string, string | number>;

export type CategorySpendBarSeries = {
  data: CategorySpendBarRow[];
  /** Series keys in stack order (bottom → top). */
  keys: string[];
  labels: Record<string, string>;
  colors: Record<string, string>;
  /**
   * Signed euros by month → series key (same sign as transaction amountCents).
   * Used in tooltips so credits stay positive and debits stay negative.
   */
  signedByMonth: Record<string, Record<string, number>>;
};

const monthLabelFormatter = (() => {
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short" });
  } catch {
    return null;
  }
})();

function formatMonthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match || !monthLabelFormatter) return month.slice(5);
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return monthLabelFormatter.format(date);
}

function normalizeColor(color: string): string {
  return color.trim().toLowerCase();
}

/**
 * Ensure every stack series gets a visually distinct color. Prefer each
 * category's own icon color when unique; otherwise walk the finance palette.
 */
export function assignDistinctStackColors(
  keys: string[],
  preferredByKey: Record<string, string>,
  parentAccent: string,
): Record<string, string> {
  const used = new Set<string>();
  const result: Record<string, string> = {};
  let presetIndex = 0;

  const takePreset = (avoid: string | null): string => {
    for (let attempt = 0; attempt < ENTITY_ICON_COLOR_PRESETS.length * 2; attempt++) {
      const candidate =
        ENTITY_ICON_COLOR_PRESETS[presetIndex % ENTITY_ICON_COLOR_PRESETS.length]!;
      presetIndex += 1;
      const normalized = normalizeColor(candidate);
      if (used.has(normalized)) continue;
      if (avoid && normalized === normalizeColor(avoid)) continue;
      return candidate;
    }
    // Past the fixed palette: generate distinct hues so large stacks stay readable.
    for (let attempt = 0; attempt < 48; attempt++) {
      const hue = (presetIndex * 47 + attempt * 19) % 360;
      presetIndex += 1;
      const candidate = `hsl(${hue} 62% 56%)`;
      const normalized = normalizeColor(candidate);
      if (used.has(normalized)) continue;
      if (avoid && normalized === normalizeColor(avoid)) continue;
      return candidate;
    }
    return ENTITY_ICON_COLOR_PRESETS[0]!;
  };

  for (const key of keys) {
    if (key === CATEGORY_SPEND_DIRECT_KEY) {
      result[key] = parentAccent;
      used.add(normalizeColor(parentAccent));
      continue;
    }

    const preferred = preferredByKey[key]?.trim();
    const preferredNorm = preferred ? normalizeColor(preferred) : null;
    const canUsePreferred =
      Boolean(preferred) &&
      preferredNorm != null &&
      !used.has(preferredNorm);

    const color = canUsePreferred ? preferred! : takePreset(parentAccent);
    result[key] = color;
    used.add(normalizeColor(color));
  }

  return result;
}

/**
 * Net spend in cents (matches the categories Spent column).
 * Credits reduce spend so reimbursements lower the stacked bar.
 */
function transactionNetSpendCents(tx: FinancialTransaction): number {
  return -tx.amountCents;
}

export function categorySpendChartHasData(
  series: CategorySpendBarSeries,
): boolean {
  return series.data.some((row) =>
    series.keys.some((key) => Number(row[key] ?? 0) > 0),
  );
}

/**
 * Build stacked monthly bar data for a category. When `children` is non-empty,
 * each month bar is broken down by subcategory (+ direct parent spend).
 */
export function buildCategorySpendBarSeries(input: {
  categoryId: string;
  categoryName: string;
  accent: string;
  months: CategorySpendMonthInput[];
  transactions: FinancialTransaction[];
  children: FinancialCategory[];
  colorForCategory: (category: FinancialCategory) => string;
}): CategorySpendBarSeries {
  const {
    categoryId,
    categoryName,
    accent,
    months,
    transactions,
    children,
    colorForCategory,
  } = input;

  const childIds = new Set(children.map((child) => child.id));
  const sortedChildren = [...children].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  const hasChildren = sortedChildren.length > 0;
  const keys = hasChildren
    ? [CATEGORY_SPEND_DIRECT_KEY, ...sortedChildren.map((child) => child.id)]
    : [categoryId];

  const labels: Record<string, string> = hasChildren
    ? {
        [CATEGORY_SPEND_DIRECT_KEY]: `${categoryName} (direct)`,
        ...Object.fromEntries(
          sortedChildren.map((child) => [child.id, child.name]),
        ),
      }
    : { [categoryId]: categoryName };

  const preferredColors: Record<string, string> = hasChildren
    ? {
        [CATEGORY_SPEND_DIRECT_KEY]: accent,
        ...Object.fromEntries(
          sortedChildren.map((child) => [child.id, colorForCategory(child)]),
        ),
      }
    : { [categoryId]: accent };

  const monthKeys =
    months.length > 0
      ? months.map((entry) => entry.month)
      : (() => {
          const fromTx = new Set<string>();
          for (const tx of transactions) {
            if (tx.bookedOn && /^\d{4}-\d{2}/.test(tx.bookedOn)) {
              fromTx.add(tx.bookedOn.slice(0, 7));
            }
          }
          return [...fromTx].sort().slice(-12);
        })();

  const totals = new Map<string, Map<string, number>>();
  const signedTotals = new Map<string, Map<string, number>>();
  for (const month of monthKeys) {
    totals.set(month, new Map(keys.map((key) => [key, 0])));
    signedTotals.set(month, new Map(keys.map((key) => [key, 0])));
  }

  for (const tx of transactions) {
    if (!isBalanceAffectingFinancialSettlement(tx.settlementState)) continue;
    const bookedOn = tx.bookedOn;
    if (!bookedOn || !/^\d{4}-\d{2}/.test(bookedOn)) continue;
    const month = bookedOn.slice(0, 7);
    const bucket = totals.get(month);
    const signedBucket = signedTotals.get(month);
    if (!bucket || !signedBucket) continue;

    const txCategoryId = tx.categoryId;
    let seriesKey: string | null = null;
    if (!hasChildren) {
      seriesKey = categoryId;
    } else if (txCategoryId === categoryId) {
      seriesKey = CATEGORY_SPEND_DIRECT_KEY;
    } else if (txCategoryId && childIds.has(txCategoryId)) {
      seriesKey = txCategoryId;
    }

    if (!seriesKey) continue;
    bucket.set(
      seriesKey,
      (bucket.get(seriesKey) ?? 0) + transactionNetSpendCents(tx),
    );
    signedBucket.set(
      seriesKey,
      (signedBucket.get(seriesKey) ?? 0) + tx.amountCents,
    );
  }

  const data: CategorySpendBarRow[] = monthKeys.map((month) => {
    const bucket = totals.get(month)!;
    const row: CategorySpendBarRow = {
      month,
      monthLabel: formatMonthLabel(month),
    };
    for (const key of keys) {
      // Bars show net outflow only; over-reimbursed months render as zero.
      const cents = Math.max(0, bucket.get(key) ?? 0);
      row[key] = Number((cents / 100).toFixed(2));
    }
    return row;
  });

  const signedByMonth: Record<string, Record<string, number>> = {};
  for (const month of monthKeys) {
    const signedBucket = signedTotals.get(month)!;
    signedByMonth[month] = {};
    for (const key of keys) {
      signedByMonth[month]![key] = Number(
        ((signedBucket.get(key) ?? 0) / 100).toFixed(2),
      );
    }
  }

  // Drop series that are zero across the whole window (keeps tooltip clean).
  const activeKeys = keys.filter((key) =>
    data.some((row) => Number(row[key] ?? 0) > 0) ||
    monthKeys.some((month) => (signedByMonth[month]?.[key] ?? 0) !== 0),
  );
  const finalKeys = activeKeys.length > 0 ? activeKeys : keys.slice(0, 1);

  return {
    data,
    keys: finalKeys,
    labels,
    colors: assignDistinctStackColors(finalKeys, preferredColors, accent),
    signedByMonth,
  };
}

function resolveRegularRootId(
  categoryId: string,
  byId: Map<string, FinancialCategory>,
): string | null {
  let current = byId.get(categoryId);
  if (!current) return null;
  while (current.parentId) {
    const parent = byId.get(current.parentId);
    if (!parent) break;
    current = parent;
  }
  if (current.listing === "excluded") return null;
  if (current.kind === "transfer") return null;
  return current.id;
}

/**
 * Build stacked monthly bars for all regular top-level categories.
 * Subcategory spend is rolled into its parent root (same as the list totals).
 */
export function buildAllCategoriesSpendBarSeries(input: {
  categories: FinancialCategory[];
  months: CategorySpendMonthInput[];
  /** Debit/credit net spend cents keyed by category id, one entry per month. */
  monthsSpent: Array<{
    month: string;
    spentByCategoryId: Record<string, number>;
  }>;
  colorForCategory: (category: FinancialCategory) => string;
}): CategorySpendBarSeries {
  const { categories, months, monthsSpent, colorForCategory } = input;
  const byId = new Map(categories.map((category) => [category.id, category]));
  const roots = categories
    .filter(
      (category) =>
        category.parentId == null &&
        category.listing !== "excluded" &&
        category.kind !== "transfer",
    )
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );

  const monthKeys =
    months.length > 0
      ? months.map((entry) => entry.month)
      : monthsSpent.map((entry) => entry.month).sort();

  const spentByMonth = new Map(
    monthsSpent.map((entry) => [entry.month, entry.spentByCategoryId]),
  );

  const totals = new Map<string, Map<string, number>>();
  for (const month of monthKeys) {
    totals.set(
      month,
      new Map(roots.map((root) => [root.id, 0])),
    );
  }

  for (const month of monthKeys) {
    const bucket = totals.get(month)!;
    const spent = spentByMonth.get(month) ?? {};
    for (const [categoryId, cents] of Object.entries(spent)) {
      // Net-spend polarity: only roll positive outflow into spend stacks.
      if (cents <= 0) continue;
      const rootId = resolveRegularRootId(categoryId, byId);
      if (!rootId || !bucket.has(rootId)) continue;
      bucket.set(rootId, (bucket.get(rootId) ?? 0) + cents);
    }
  }

  const data: CategorySpendBarRow[] = monthKeys.map((month) => {
    const bucket = totals.get(month)!;
    const row: CategorySpendBarRow = {
      month,
      monthLabel: formatMonthLabel(month),
    };
    for (const root of roots) {
      row[root.id] = Number(((bucket.get(root.id) ?? 0) / 100).toFixed(2));
    }
    return row;
  });

  const totalsByRoot = new Map<string, number>();
  for (const root of roots) {
    let sum = 0;
    for (const row of data) sum += Number(row[root.id] ?? 0);
    totalsByRoot.set(root.id, sum);
  }

  const activeKeys = roots
    .map((root) => root.id)
    .filter((id) => (totalsByRoot.get(id) ?? 0) > 0)
    // Largest at the bottom of the stack for a stable reading order.
    .sort(
      (a, b) => (totalsByRoot.get(b) ?? 0) - (totalsByRoot.get(a) ?? 0),
    );

  const labels = Object.fromEntries(
    roots.map((root) => [root.id, root.name]),
  );
  const preferredColors = Object.fromEntries(
    roots.map((root) => [root.id, colorForCategory(root)]),
  );
  const accent = preferredColors[activeKeys[0] ?? ""] ?? "#9CA3AF";

  const finalKeys =
    activeKeys.length > 0 ? activeKeys : roots.slice(0, 1).map((r) => r.id);

  const signedByMonth: Record<string, Record<string, number>> = {};
  for (const row of data) {
    const month = String(row.month);
    signedByMonth[month] = {};
    for (const key of finalKeys) {
      // Overview months are debit-only positives; tooltip uses amount sign
      // (debits negative).
      signedByMonth[month]![key] = -Number(row[key] ?? 0);
    }
  }

  return {
    data,
    keys: finalKeys,
    labels,
    colors: assignDistinctStackColors(finalKeys, preferredColors, accent),
    signedByMonth,
  };
}

/** Last N calendar months ending at `endMonth` (YYYY-MM), inclusive. */
export function listTrailingMonthKeys(
  endMonth: string,
  count = 12,
): string[] {
  const match = /^(\d{4})-(\d{2})$/.exec(endMonth);
  if (!match) return [];
  let year = Number(match[1]);
  let month = Number(match[2]);
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    keys.push(`${year}-${String(month).padStart(2, "0")}`);
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
  }
  return keys.reverse();
}

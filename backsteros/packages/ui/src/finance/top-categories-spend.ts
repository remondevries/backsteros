import type { FinancialCategory } from "@backsteros/contracts";

export type TopCategorySpendRow = {
  id: string;
  name: string;
  icon: string | null;
  /** Net-spend polarity after spend clamping (positive = outflow). */
  spentCents: number;
  depth: 0 | 1;
};

function sortCategories(rows: FinancialCategory[]): FinancialCategory[] {
  return [...rows].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
}

/**
 * Spend for dashboard "Top categories": only expense-like categories, with
 * per-row clamp ≥ 0 so income/credits cannot cancel parent spend or enter the
 * % denominator. Does not mutate category/transaction data — mis-kinded rows
 * (e.g. an "Income" category with kind=expense) still clamp to 0 when their
 * net is a credit.
 */
export function buildTopCategoriesSpend(
  categories: FinancialCategory[],
  spentCentsByCategoryId: Record<string, number>,
): TopCategorySpendRow[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const childrenByParent = new Map<string, FinancialCategory[]>();
  const roots: FinancialCategory[] = [];

  for (const category of categories) {
    if (category.listing === "excluded" || category.kind === "transfer") continue;
    // Income-kind categories belong on the income side, not spend breakdowns.
    if (category.kind === "income") continue;
    if (category.parentId && byId.has(category.parentId)) {
      const parent = byId.get(category.parentId);
      if (
        !parent ||
        parent.listing === "excluded" ||
        parent.kind === "transfer" ||
        parent.kind === "income"
      ) {
        continue;
      }
      const list = childrenByParent.get(category.parentId) ?? [];
      list.push(category);
      childrenByParent.set(category.parentId, list);
    } else if (!category.parentId) {
      roots.push(category);
    }
  }

  const rows: TopCategorySpendRow[] = [];

  for (const root of sortCategories(roots)) {
    const children = sortCategories(childrenByParent.get(root.id) ?? []);
    const childSpend = children.map((child) => ({
      child,
      // Clamp: credits (negative net) do not reduce parent spend in this list.
      spentCents: Math.max(0, spentCentsByCategoryId[child.id] ?? 0),
    }));
    const childrenWithSpend = childSpend.filter((row) => row.spentCents > 0);
    const ownSpend = Math.max(0, spentCentsByCategoryId[root.id] ?? 0);
    const rolledSpend =
      ownSpend + childrenWithSpend.reduce((sum, row) => sum + row.spentCents, 0);

    if (rolledSpend <= 0) continue;

    rows.push({
      id: root.id,
      name: root.name,
      icon: root.icon,
      spentCents: rolledSpend,
      depth: 0,
    });
    for (const { child, spentCents } of childrenWithSpend) {
      rows.push({
        id: child.id,
        name: child.name,
        icon: child.icon,
        spentCents,
        depth: 1,
      });
    }
  }

  return rows;
}

/** Denominator for spend shares: sum of positive root spend only. */
export function topCategoriesSpendTotalCents(
  rows: ReadonlyArray<TopCategorySpendRow>,
): number {
  return rows
    .filter((row) => row.depth === 0)
    .reduce((sum, row) => sum + Math.max(0, row.spentCents), 0);
}

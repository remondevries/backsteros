import type { FinancialCategory } from "@backsteros/contracts";

export type TopCategorySpendRow = {
  id: string;
  name: string;
  icon: string | null;
  /** Net-spend polarity after spend clamping (positive = outflow). */
  spentCents: number;
  depth: 0 | 1 | 2;
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

  const rollSpend = (categoryId: string): number => {
    const own = Math.max(0, spentCentsByCategoryId[categoryId] ?? 0);
    const kids = sortCategories(childrenByParent.get(categoryId) ?? []);
    return (
      own + kids.reduce((sum, child) => sum + rollSpend(child.id), 0)
    );
  };

  for (const root of sortCategories(roots)) {
    const rolledSpend = rollSpend(root.id);
    if (rolledSpend <= 0) continue;

    rows.push({
      id: root.id,
      name: root.name,
      icon: root.icon,
      spentCents: rolledSpend,
      depth: 0,
    });
    for (const child of sortCategories(childrenByParent.get(root.id) ?? [])) {
      const childRolled = rollSpend(child.id);
      if (childRolled <= 0) continue;
      rows.push({
        id: child.id,
        name: child.name,
        icon: child.icon,
        spentCents: childRolled,
        depth: 1,
      });
      for (const grand of sortCategories(
        childrenByParent.get(child.id) ?? [],
      )) {
        const grandSpend = Math.max(
          0,
          spentCentsByCategoryId[grand.id] ?? 0,
        );
        if (grandSpend <= 0) continue;
        rows.push({
          id: grand.id,
          name: grand.name,
          icon: grand.icon,
          spentCents: grandSpend,
          depth: 2,
        });
      }
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

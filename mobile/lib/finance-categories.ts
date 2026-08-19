export type FinanceCategoryRow = {
  id: string;
  name: string;
  parentId: string | null;
  kind: string;
  listing: string;
  icon: string | null;
  sortOrder: number;
};

export type FinanceCategoryNode = FinanceCategoryRow & {
  children: FinanceCategoryRow[];
};

export type CategoryIconDisplay = {
  /** Emoji glyph when the icon is an emoji, otherwise null. */
  emoji: string | null;
  /** Accent color for dot/named icons (`#RGB` / `#RRGGBB`), otherwise null. */
  color: string | null;
};

/**
 * Category `icon` values use the desktop entity-icon JSON serialization:
 * `{"t":"d","c":"#hex"}` (colored dot), `{"t":"e","v":"🙂"}` (emoji), or
 * `{"t":"i","k":"cart","c":"#hex"}` (named icon). Mobile renders emoji as-is
 * and reduces dot/named icons to their accent color.
 */
export function categoryIconDisplay(
  raw: string | null | undefined,
): CategoryIconDisplay {
  const trimmed = raw?.trim();
  if (!trimmed) return { emoji: null, color: null };
  if (!trimmed.startsWith("{")) {
    return { emoji: null, color: null };
  }
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed.t === "e" && typeof parsed.v === "string") {
      return { emoji: parsed.v, color: null };
    }
    const color =
      typeof parsed.c === "string" &&
      /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(parsed.c)
        ? parsed.c
        : null;
    return { emoji: null, color };
  } catch {
    return { emoji: null, color: null };
  }
}

function bySortThenName(a: FinanceCategoryRow, b: FinanceCategoryRow): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.name.localeCompare(b.name);
}

/**
 * Parent/child tree in display order. Categories whose parent is missing
 * (or soft-deleted) are treated as roots so nothing disappears from the list.
 */
export function buildCategoryTree(
  rows: readonly FinanceCategoryRow[],
): FinanceCategoryNode[] {
  const ids = new Set(rows.map((row) => row.id));
  const roots: FinanceCategoryRow[] = [];
  const childrenByParent = new Map<string, FinanceCategoryRow[]>();

  for (const row of rows) {
    if (row.parentId && ids.has(row.parentId)) {
      const bucket = childrenByParent.get(row.parentId) ?? [];
      bucket.push(row);
      childrenByParent.set(row.parentId, bucket);
    } else {
      roots.push(row);
    }
  }

  roots.sort(bySortThenName);
  return roots.map((root) => ({
    ...root,
    children: (childrenByParent.get(root.id) ?? []).sort(bySortThenName),
  }));
}

/** Root category id for any category (rolls children into their parent). */
export function rootCategoryId(
  categoryId: string,
  rows: readonly FinanceCategoryRow[],
): string {
  const byId = new Map(rows.map((row) => [row.id, row]));
  let current = byId.get(categoryId);
  const guard = new Set<string>();
  while (current?.parentId && byId.has(current.parentId)) {
    if (guard.has(current.id)) break;
    guard.add(current.id);
    current = byId.get(current.parentId);
  }
  return current?.id ?? categoryId;
}

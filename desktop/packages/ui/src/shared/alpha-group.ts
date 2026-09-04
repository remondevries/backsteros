export function groupItemsByAlphaLetter<
  T extends { name: string; lastName?: string | null; firstName?: string | null },
>(items: readonly T[]): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const sortLabel = (item.lastName?.trim() || item.name || "").trim();
    const first = sortLabel[0]?.toUpperCase() ?? "#";
    const key = first >= "A" && first <= "Z" ? first : "#";
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }
  for (const entries of groups.values()) {
    entries.sort((a, b) => {
      const aLast = (a.lastName?.trim() || a.name || "").toLocaleLowerCase();
      const bLast = (b.lastName?.trim() || b.name || "").toLocaleLowerCase();
      const lastCmp = aLast.localeCompare(bLast, undefined, {
        sensitivity: "base",
      });
      if (lastCmp !== 0) return lastCmp;
      const aFirst = (
        a.firstName?.trim() ||
        a.name ||
        ""
      ).toLocaleLowerCase();
      const bFirst = (
        b.firstName?.trim() ||
        b.name ||
        ""
      ).toLocaleLowerCase();
      return aFirst.localeCompare(bFirst, undefined, { sensitivity: "base" });
    });
  }
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === "#") return 1;
    if (b === "#") return -1;
    return a.localeCompare(b);
  });
}

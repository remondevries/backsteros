export function groupItemsByAlphaLetter<
  T extends { name: string; lastName?: string | null },
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
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === "#") return 1;
    if (b === "#") return -1;
    return a.localeCompare(b);
  });
}

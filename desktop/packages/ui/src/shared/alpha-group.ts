/**
 * A–Z section letter: prefer first name / display name so "Erwin van Gijtenbeek"
 * lands under E (not V from the tussenvoegsel). Within a section, still sort by
 * last name when present.
 */
function sectionLabel(item: {
  name: string;
  lastName?: string | null;
  firstName?: string | null;
}): string {
  return (item.firstName?.trim() || item.name || "").trim();
}

function orderLabel(item: {
  name: string;
  lastName?: string | null;
  firstName?: string | null;
}): string {
  return (item.lastName?.trim() || item.name || "").trim();
}

export function groupItemsByAlphaLetter<
  T extends { name: string; lastName?: string | null; firstName?: string | null },
>(items: readonly T[]): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const sortLabel = sectionLabel(item);
    const first = sortLabel[0]?.toUpperCase() ?? "#";
    const key = first >= "A" && first <= "Z" ? first : "#";
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }
  for (const entries of groups.values()) {
    entries.sort((a, b) => {
      const aLast = orderLabel(a).toLocaleLowerCase();
      const bLast = orderLabel(b).toLocaleLowerCase();
      const lastCmp = aLast.localeCompare(bLast, undefined, {
        sensitivity: "base",
      });
      if (lastCmp !== 0) return lastCmp;
      const aFirst = sectionLabel(a).toLocaleLowerCase();
      const bFirst = sectionLabel(b).toLocaleLowerCase();
      return aFirst.localeCompare(bFirst, undefined, { sensitivity: "base" });
    });
  }
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === "#") return 1;
    if (b === "#") return -1;
    return a.localeCompare(b);
  });
}

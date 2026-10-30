/**
 * Display order for Settings → API → Agent and the shell chat peer strip.
 * Server `sortOrder` is source of truth after migration; localStorage covers
 * pre-migration cloud and optimistic reorder before the PUT returns.
 */

const STORAGE_KEY = "backsteros:agent-sort-order";

export function readAgentSortOrderIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((id): id is string => typeof id === "string" && id.trim() !== "")
      .map((id) => id.trim());
  } catch {
    return [];
  }
}

export function writeAgentSortOrderIds(agentIds: readonly string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(agentIds.map((id) => id.trim()).filter(Boolean)),
    );
  } catch {
    // ignore quota / private mode
  }
}

type OrderableAgent = {
  id: string;
  sortOrder?: number | null;
  name?: string | null;
};

/**
 * Sort agents for the Settings table and chat strip.
 * Prefer non-default server sortOrder when any agent has sortOrder ≠ 0;
 * otherwise fall back to localStorage order (pre-migration / first use).
 */
export function sortAgentsForDisplay<T extends OrderableAgent>(
  agents: readonly T[],
  preferredIds: readonly string[] | null = null,
): T[] {
  if (agents.length <= 1) return [...agents];
  const local = preferredIds ?? readAgentSortOrderIds();
  const hasServerOrder = agents.some((agent) => (agent.sortOrder ?? 0) !== 0);

  if (hasServerOrder) {
    return [...agents].sort((a, b) => {
      const byOrder = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (byOrder !== 0) return byOrder;
      return (a.name ?? a.id).localeCompare(b.name ?? b.id);
    });
  }

  if (local.length === 0) {
    return [...agents].sort((a, b) =>
      (a.name ?? a.id).localeCompare(b.name ?? b.id),
    );
  }

  const index = new Map(local.map((id, i) => [id, i]));
  return [...agents].sort((a, b) => {
    const ai = index.has(a.id) ? index.get(a.id)! : Number.MAX_SAFE_INTEGER;
    const bi = index.has(b.id) ? index.get(b.id)! : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return (a.name ?? a.id).localeCompare(b.name ?? b.id);
  });
}

/** Swap two positions in an id list (no-op when out of bounds). */
export function moveIdInOrder(
  orderedIds: readonly string[],
  id: string,
  direction: -1 | 1,
): string[] {
  const next = [...orderedIds];
  const from = next.indexOf(id);
  if (from < 0) return next;
  const to = from + direction;
  if (to < 0 || to >= next.length) return next;
  const tmp = next[from]!;
  next[from] = next[to]!;
  next[to] = tmp;
  return next;
}

/**
 * Display order for Settings → API → Agent and the shell chat peer strip.
 * localStorage is the sticky client order (survives webhook edits that return
 * sortOrder 0). Server `sortOrder` seeds order when localStorage is empty.
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

function compareBySortOrderThenName(a: OrderableAgent, b: OrderableAgent): number {
  const byOrder = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  if (byOrder !== 0) return byOrder;
  return (a.name ?? a.id).localeCompare(b.name ?? b.id);
}

/**
 * Sort agents for the Settings table and chat strip.
 * Prefer localStorage order whenever it mentions any of these agents so a
 * webhook/API-key edit cannot bump a row to the top via sortOrder 0.
 */
export function sortAgentsForDisplay<T extends OrderableAgent>(
  agents: readonly T[],
  preferredIds: readonly string[] | null = null,
): T[] {
  if (agents.length <= 1) return [...agents];
  const local = preferredIds ?? readAgentSortOrderIds();
  if (local.length > 0) {
    const index = new Map(local.map((id, i) => [id, i]));
    const hasOverlap = agents.some((agent) => index.has(agent.id));
    if (hasOverlap) {
      return [...agents].sort((a, b) => {
        const ai = index.has(a.id) ? index.get(a.id)! : Number.MAX_SAFE_INTEGER;
        const bi = index.has(b.id) ? index.get(b.id)! : Number.MAX_SAFE_INTEGER;
        if (ai !== bi) return ai - bi;
        return compareBySortOrderThenName(a, b);
      });
    }
  }

  return [...agents].sort(compareBySortOrderThenName);
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

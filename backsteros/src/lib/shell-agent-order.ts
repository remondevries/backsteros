/**
 * Display order for Settings → API → Agent and the shell chat peer strip.
 * localStorage is the sticky client order (survives webhook edits that return
 * sortOrder 0). Server `sortOrder` seeds order when localStorage is empty.
 */

const STORAGE_KEY = "backsteros:agent-sort-order";
/** Settings → API → Agent table order (api key ids). Chat strip uses agent ids above. */
const API_KEY_STORAGE_KEY = "backsteros:agent-api-key-sort-order";

function readIdList(storageKey: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
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

function writeIdList(storageKey: string, ids: readonly string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify(ids.map((id) => id.trim()).filter(Boolean)),
    );
  } catch {
    // ignore quota / private mode
  }
}

export function readAgentSortOrderIds(): string[] {
  return readIdList(STORAGE_KEY);
}

export function writeAgentSortOrderIds(agentIds: readonly string[]): void {
  writeIdList(STORAGE_KEY, agentIds);
}

export function readAgentApiKeySortOrderIds(): string[] {
  return readIdList(API_KEY_STORAGE_KEY);
}

export function writeAgentApiKeySortOrderIds(apiKeyIds: readonly string[]): void {
  writeIdList(API_KEY_STORAGE_KEY, apiKeyIds);
}

type OrderableAgent = {
  id: string;
  apiKeyId?: string | null;
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
 *
 * The Settings → API → Agent table order (API key ids) wins, so the chat strip
 * matches it even when an agent row was recreated for the same key. Agents
 * without a ranked key follow the agent-id order, then server `sortOrder`.
 */
export function sortAgentsForDisplay<T extends OrderableAgent>(
  agents: readonly T[],
  preferredIds: readonly string[] | null = null,
  apiKeyOrderIds: readonly string[] | null = null,
): T[] {
  if (agents.length <= 1) return [...agents];
  const byAgentIds = sortByAgentIds(agents, preferredIds);
  const keyOrder = apiKeyOrderIds ?? readAgentApiKeySortOrderIds();
  if (keyOrder.length === 0) return byAgentIds;
  const keyIndex = new Map(keyOrder.map((id, i) => [id, i]));
  const keyRank = (agent: T): number => {
    const apiKeyId = agent.apiKeyId?.trim();
    return apiKeyId && keyIndex.has(apiKeyId)
      ? keyIndex.get(apiKeyId)!
      : Number.MAX_SAFE_INTEGER;
  };
  if (!agents.some((agent) => keyRank(agent) !== Number.MAX_SAFE_INTEGER)) {
    return byAgentIds;
  }
  const fallbackIndex = new Map(byAgentIds.map((agent, i) => [agent.id, i]));
  return [...agents].sort(
    (a, b) =>
      keyRank(a) - keyRank(b) ||
      fallbackIndex.get(a.id)! - fallbackIndex.get(b.id)!,
  );
}

function sortByAgentIds<T extends OrderableAgent>(
  agents: readonly T[],
  preferredIds: readonly string[] | null,
): T[] {
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

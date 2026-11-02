/**
 * Display order for Settings → API → Agent and the shell chat peer strip.
 *
 * Session memory + localStorage are the sticky client order (survives webhook
 * edits that return sortOrder 0). Server `sortOrder` seeds order when both are
 * empty. Memory wins within a session so a failed localStorage write cannot
 * snap the Settings table or chat strip back after a drag.
 */

const STORAGE_KEY = "backsteros:agent-sort-order";
/** Settings → API → Agent table order (api key ids). Chat strip uses agent ids above. */
const API_KEY_STORAGE_KEY = "backsteros:agent-api-key-sort-order";

let memoryAgentOrderIds: string[] | null = null;
let memoryApiKeyOrderIds: string[] | null = null;

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
    // ignore quota / private mode — memory cache still holds the session order
  }
}

function normalizeIds(ids: readonly string[]): string[] {
  return ids.map((id) => id.trim()).filter(Boolean);
}

export function readAgentSortOrderIds(): string[] {
  if (memoryAgentOrderIds && memoryAgentOrderIds.length > 0) {
    return [...memoryAgentOrderIds];
  }
  return readIdList(STORAGE_KEY);
}

export function writeAgentSortOrderIds(agentIds: readonly string[]): void {
  memoryAgentOrderIds = normalizeIds(agentIds);
  writeIdList(STORAGE_KEY, memoryAgentOrderIds);
}

export function readAgentApiKeySortOrderIds(): string[] {
  if (memoryApiKeyOrderIds && memoryApiKeyOrderIds.length > 0) {
    return [...memoryApiKeyOrderIds];
  }
  return readIdList(API_KEY_STORAGE_KEY);
}

export function writeAgentApiKeySortOrderIds(apiKeyIds: readonly string[]): void {
  memoryApiKeyOrderIds = normalizeIds(apiKeyIds);
  writeIdList(API_KEY_STORAGE_KEY, memoryApiKeyOrderIds);
}

/**
 * Keep saved API key order aligned with the current Agent-tab keys:
 * drop revoked ids, append brand-new keys at the end.
 * Returns [] when there is no saved order yet — callers should leave
 * server `sortOrder` in charge until the user drags once.
 */
export function reconcileAgentApiKeyOrderIds(
  currentApiKeyIds: readonly string[],
  preferredIds: readonly string[] | null = null,
): string[] {
  const current = normalizeIds(currentApiKeyIds);
  if (current.length === 0) return [];
  const preferred = normalizeIds(preferredIds ?? readAgentApiKeySortOrderIds());
  if (preferred.length === 0) return [];
  const currentSet = new Set(current);
  const next = preferred.filter((id) => currentSet.has(id));
  const seen = new Set(next);
  for (const id of current) {
    if (seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  return next;
}

type OrderableAgent = {
  id: string;
  apiKeyId?: string | null;
  contactId?: string | null;
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

/**
 * Map a dragged API-key id list onto agent ids (apiKeyId first, then contactId).
 * Unmatched agents keep relative order at the end.
 */
export function agentIdsForApiKeyOrder<
  T extends {
    id: string;
    apiKeyId?: string | null;
    contactId?: string | null;
    enabled?: boolean | null;
  },
>(
  agents: readonly T[],
  orderedApiKeyIds: readonly string[],
  apiKeys: readonly { id: string; contactId?: string | null }[],
): string[] {
  const byApiKeyId = new Map<string, T[]>();
  for (const agent of agents) {
    const apiKeyId = agent.apiKeyId?.trim();
    if (!apiKeyId) continue;
    const list = byApiKeyId.get(apiKeyId) ?? [];
    list.push(agent);
    byApiKeyId.set(apiKeyId, list);
  }
  const byContactId = new Map<string, T[]>();
  for (const agent of agents) {
    const contactId = agent.contactId?.trim();
    if (!contactId) continue;
    const list = byContactId.get(contactId) ?? [];
    list.push(agent);
    byContactId.set(contactId, list);
  }
  const keyById = new Map(apiKeys.map((key) => [key.id, key]));

  const pick = (candidates: T[] | undefined): T | undefined => {
    if (!candidates || candidates.length === 0) return undefined;
    if (candidates.length === 1) return candidates[0];
    return [...candidates].sort((a, b) => {
      const ae = a.enabled === false ? 0 : 1;
      const be = b.enabled === false ? 0 : 1;
      return be - ae;
    })[0];
  };

  const agentIds: string[] = [];
  const seen = new Set<string>();
  for (const apiKeyId of orderedApiKeyIds) {
    const linked =
      pick(byApiKeyId.get(apiKeyId)) ??
      pick(byContactId.get(keyById.get(apiKeyId)?.contactId?.trim() ?? ""));
    if (!linked || seen.has(linked.id)) continue;
    seen.add(linked.id);
    agentIds.push(linked.id);
  }
  for (const agent of agents) {
    if (seen.has(agent.id)) continue;
    seen.add(agent.id);
    agentIds.push(agent.id);
  }
  return agentIds;
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

/** Test helper — clear session memory between cases. */
export function resetAgentOrderMemoryForTests(): void {
  memoryAgentOrderIds = null;
  memoryApiKeyOrderIds = null;
}

/**
 * Agent surface tab state — mirrors desktop `agent-surface-tabs.ts`
 * (mobile-owned copy; no shared UI package).
 */

export type AgentSurfaceTabKind =
  | "chat"
  | "browser"
  | "terminal"
  | "files"
  | "plan"
  | "diff";

export type AgentSurfaceTab = {
  id: string;
  kind: AgentSurfaceTabKind;
  title: string;
  /** Browser URL, etc. */
  resourceId?: string | null;
};

export type AgentSurfaceTabsState = {
  tabs: AgentSurfaceTab[];
  /** `null` when no surface is open (empty picker). */
  activeId: string | null;
};

const SINGLETON_KINDS = new Set<AgentSurfaceTabKind>([
  "chat",
  "files",
  "plan",
  "diff",
]);

function newTabId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function baseTitleForKind(kind: AgentSurfaceTabKind): string {
  switch (kind) {
    case "chat":
      return "Agent";
    case "browser":
      return "Browser";
    case "terminal":
      return "Terminal";
    case "files":
      return "Files";
    case "plan":
      return "Plan";
    case "diff":
      return "Diff";
  }
}

/** Next label for a multi tab: `Browser`, then `Browser 2`, … */
export function nextNumberedTabTitle(
  tabs: AgentSurfaceTab[],
  kind: AgentSurfaceTabKind,
): string {
  const base = baseTitleForKind(kind);
  const same = tabs.filter((tab) => tab.kind === kind);
  if (same.length === 0) return base;

  let max = 0;
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const numbered = new RegExp(`^${escaped} (\\d+)$`);
  for (const tab of same) {
    if (tab.title === base) {
      max = Math.max(max, 1);
      continue;
    }
    const match = numbered.exec(tab.title);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max <= 0 ? base : `${base} ${max + 1}`;
}

/** Empty right panel — show the “Open a surface” picker. */
export function createDefaultAgentSurfaceTabs(): AgentSurfaceTabsState {
  return { tabs: [], activeId: null };
}

/**
 * Add or activate a surface tab.
 * Singleton kinds (chat/files/plan/diff) re-activate an existing tab.
 * Multi kinds (browser/terminal) always append.
 */
export function addAgentSurfaceTab(
  tabs: AgentSurfaceTab[],
  kind: AgentSurfaceTabKind,
  options?: { resourceId?: string | null; title?: string },
): AgentSurfaceTabsState {
  if (SINGLETON_KINDS.has(kind)) {
    const existing = tabs.find((tab) => tab.kind === kind);
    if (existing) {
      return { tabs, activeId: existing.id };
    }
  }

  const id = newTabId();
  const title = options?.title ?? nextNumberedTabTitle(tabs, kind);
  return {
    tabs: [
      ...tabs,
      {
        id,
        kind,
        title,
        resourceId: options?.resourceId ?? null,
      },
    ],
    activeId: id,
  };
}

export function updateAgentSurfaceTab(
  tabs: AgentSurfaceTab[],
  id: string,
  patch: Partial<Pick<AgentSurfaceTab, "title" | "resourceId">>,
): AgentSurfaceTab[] {
  return tabs.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab));
}

/**
 * Close a tab. Closing the last tab yields an empty state (surface picker).
 */
export function closeAgentSurfaceTab(
  tabs: AgentSurfaceTab[],
  id: string,
  activeId: string | null,
): AgentSurfaceTabsState {
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return { tabs, activeId };

  const next = tabs.filter((tab) => tab.id !== id);
  if (next.length === 0) {
    return { tabs: [], activeId: null };
  }
  if (activeId !== id) return { tabs: next, activeId };

  const neighbor = next[Math.max(0, index - 1)] ?? next[0]!;
  return { tabs: next, activeId: neighbor.id };
}

/**
 * Ensure a Chat tab exists and is active. Used when a task already has an
 * agentChatId bound (same session across iPad / iPhone / desktop).
 */
export function ensureChatTab(tabs: AgentSurfaceTab[]): AgentSurfaceTabsState {
  const existing = tabs.find((tab) => tab.kind === "chat");
  if (existing) {
    return { tabs, activeId: existing.id };
  }
  return addAgentSurfaceTab(tabs, "chat");
}

const SURFACE_TABS_STORAGE_PREFIX =
  "backsteros-mobile.agent-surface-tabs.v1.";

/** In-memory cache so navigate-away / come-back restores tabs in-session. */
const surfaceTabsMemory = new Map<string, AgentSurfaceTabsState>();

function surfaceTabsStorageKey(taskId: string): string {
  return `${SURFACE_TABS_STORAGE_PREFIX}${taskId.trim().toLowerCase()}`;
}

function normalizeStoredTabsState(
  raw: unknown,
): AgentSurfaceTabsState | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.tabs)) return null;

  const tabs: AgentSurfaceTab[] = [];
  for (const entry of record.tabs) {
    if (!entry || typeof entry !== "object") continue;
    const tab = entry as Record<string, unknown>;
    if (typeof tab.id !== "string" || !tab.id.trim()) continue;
    if (typeof tab.kind !== "string" || !tab.kind.trim()) continue;
    if (typeof tab.title !== "string" || !tab.title.trim()) continue;
    const kind = tab.kind as AgentSurfaceTabKind;
    if (
      kind !== "chat" &&
      kind !== "browser" &&
      kind !== "terminal" &&
      kind !== "files" &&
      kind !== "plan" &&
      kind !== "diff"
    ) {
      continue;
    }
    tabs.push({
      id: tab.id.trim(),
      kind,
      title: tab.title.trim(),
      resourceId:
        typeof tab.resourceId === "string"
          ? tab.resourceId
          : tab.resourceId === null
            ? null
            : undefined,
    });
  }

  if (tabs.length === 0) {
    return { tabs: [], activeId: null };
  }

  const activeId =
    typeof record.activeId === "string" ? record.activeId.trim() : "";
  const activeExists = tabs.some((tab) => tab.id === activeId);
  return {
    tabs,
    activeId: activeExists ? activeId : tabs[0]!.id,
  };
}

/** Sync read of in-memory tabs (hydrate may still be in flight). */
export function readAgentSurfaceTabs(
  taskId: string | null | undefined,
): AgentSurfaceTabsState {
  const id = taskId?.trim().toLowerCase();
  if (!id) return createDefaultAgentSurfaceTabs();
  return surfaceTabsMemory.get(id) ?? createDefaultAgentSurfaceTabs();
}

/** Persist per-task surface tabs (memory + SecureStore). */
export function writeAgentSurfaceTabs(
  taskId: string | null | undefined,
  state: AgentSurfaceTabsState,
): void {
  const id = taskId?.trim().toLowerCase();
  if (!id) return;
  surfaceTabsMemory.set(id, state);
  void import("expo-secure-store")
    .then((SecureStore) =>
      SecureStore.setItemAsync(
        surfaceTabsStorageKey(id),
        JSON.stringify({
          tabs: state.tabs,
          activeId: state.activeId,
        }),
      ),
    )
    .catch(() => {
      /* ignore quota / secure store errors */
    });
}

/** Load persisted tabs into memory (call on task open). */
export async function hydrateAgentSurfaceTabs(
  taskId: string | null | undefined,
): Promise<AgentSurfaceTabsState> {
  const id = taskId?.trim().toLowerCase();
  if (!id) return createDefaultAgentSurfaceTabs();

  const cached = surfaceTabsMemory.get(id);
  if (cached && cached.tabs.length > 0) return cached;

  try {
    const SecureStore = await import("expo-secure-store");
    const raw = await SecureStore.getItemAsync(surfaceTabsStorageKey(id));
    if (!raw) {
      const empty = createDefaultAgentSurfaceTabs();
      surfaceTabsMemory.set(id, empty);
      return empty;
    }
    const parsed = normalizeStoredTabsState(JSON.parse(raw) as unknown);
    const next = parsed ?? createDefaultAgentSurfaceTabs();
    surfaceTabsMemory.set(id, next);
    return next;
  } catch {
    const empty = createDefaultAgentSurfaceTabs();
    surfaceTabsMemory.set(id, empty);
    return empty;
  }
}

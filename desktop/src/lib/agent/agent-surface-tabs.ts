export const AGENT_SURFACE_ADDABLE_KINDS = [
  "browser",
  "terminal",
  "files",
  "plan",
  "diff",
] as const;

export type AgentSurfaceAddableKind =
  (typeof AGENT_SURFACE_ADDABLE_KINDS)[number];

export type AgentSurfaceTabKind = "chat" | AgentSurfaceAddableKind;

export type AgentSurfaceTab = {
  id: string;
  kind: AgentSurfaceTabKind;
  title: string;
  /** Browser URL, shell PTY session id, etc. */
  resourceId?: string | null;
};

export type AgentSurfaceTabsState = {
  tabs: AgentSurfaceTab[];
  /** `null` when no surface is open (empty picker). */
  activeId: string | null;
};

/** Singleton surfaces — re-activate if already open (only one of each). */
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

function baseTitleForKind(kind: AgentSurfaceTabKind): string {
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

/** @deprecated Use nextNumberedTabTitle(tabs, "chat") */
export function nextChatTabTitle(tabs: AgentSurfaceTab[]): string {
  return nextNumberedTabTitle(tabs, "chat");
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

/** @deprecated Use addAgentSurfaceTab(tabs, "chat") */
export function addAgentSurfaceChatTab(
  tabs: AgentSurfaceTab[],
): AgentSurfaceTabsState {
  return addAgentSurfaceTab(tabs, "chat");
}

/**
 * Ensure a Chat tab exists and is active. No-op (aside from activating) when
 * Chat is already open — used when an agent session becomes ready.
 */
export function ensureChatTab(tabs: AgentSurfaceTab[]): AgentSurfaceTabsState {
  const existing = tabs.find((tab) => tab.kind === "chat");
  if (existing) {
    return { tabs, activeId: existing.id };
  }
  return addAgentSurfaceTab(tabs, "chat");
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
 * When closing the active tab among several, activate the neighbor to the left
 * (or right if first).
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

export type AgentSurfaceTabCycleDirection = "previous" | "next";

/**
 * ⌥[ / ⌥] — previous / next agent surface tab on the task right panel.
 * Match by `code`: with Option held, `event.key` is often a special character.
 */
export function resolveAgentSurfaceTabCycleShortcut(
  event: Pick<
    KeyboardEvent,
    "altKey" | "metaKey" | "ctrlKey" | "shiftKey" | "code"
  >,
): AgentSurfaceTabCycleDirection | null {
  if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) {
    return null;
  }
  if (event.code === "BracketLeft") return "previous";
  if (event.code === "BracketRight") return "next";
  return null;
}

/**
 * ⌥W closes the active agent surface tab on the task right panel.
 * Match by `code`: with Option held, `event.key` is often a special character.
 */
export function isAgentSurfaceCloseTabShortcut(
  event: Pick<
    KeyboardEvent,
    "altKey" | "metaKey" | "ctrlKey" | "shiftKey" | "code"
  >,
): boolean {
  if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) {
    return false;
  }
  return event.code === "KeyW";
}

/** Adjacent surface tab id for ⌥[ / ⌥], or null when there is nowhere to go. */
export function resolveAdjacentAgentSurfaceTabId(
  tabs: readonly AgentSurfaceTab[],
  activeId: string | null,
  direction: AgentSurfaceTabCycleDirection,
): string | null {
  if (tabs.length <= 1) return null;
  const index = activeId
    ? tabs.findIndex((tab) => tab.id === activeId)
    : -1;
  const current = index >= 0 ? index : 0;
  const nextIndex =
    direction === "next"
      ? (current + 1) % tabs.length
      : (current - 1 + tabs.length) % tabs.length;
  return tabs[nextIndex]?.id ?? null;
}

const SURFACE_TABS_STORAGE_PREFIX =
  "backsteros-desktop.agent-surface-tabs.v1.";

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

  // Explicit empty persist is valid (picker).
  if (tabs.length === 0) {
    if (
      record.activeId === null ||
      record.activeId === undefined ||
      record.activeId === ""
    ) {
      return { tabs: [], activeId: null };
    }
    // Legacy/corrupt: non-empty activeId with no tabs → treat as empty default.
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

/** Load per-task surface tabs. Missing → empty picker default. */
export function readAgentSurfaceTabs(
  taskId: string | null | undefined,
): AgentSurfaceTabsState {
  const id = taskId?.trim();
  if (!id || typeof window === "undefined") {
    return createDefaultAgentSurfaceTabs();
  }
  try {
    const raw = window.localStorage.getItem(surfaceTabsStorageKey(id));
    if (!raw) return createDefaultAgentSurfaceTabs();
    const parsed = normalizeStoredTabsState(JSON.parse(raw) as unknown);
    return parsed ?? createDefaultAgentSurfaceTabs();
  } catch {
    return createDefaultAgentSurfaceTabs();
  }
}

/** Persist per-task surface tabs until the user closes them. */
export function writeAgentSurfaceTabs(
  taskId: string | null | undefined,
  state: AgentSurfaceTabsState,
): void {
  const id = taskId?.trim();
  if (!id || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      surfaceTabsStorageKey(id),
      JSON.stringify({
        tabs: state.tabs,
        activeId: state.activeId,
      }),
    );
  } catch {
    /* ignore quota */
  }
}

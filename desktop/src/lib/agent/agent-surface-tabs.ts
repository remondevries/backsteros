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
  activeId: string;
};

/** Singleton surfaces — re-activate if already open. */
const SINGLETON_KINDS = new Set<AgentSurfaceTabKind>([
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
      return "Chat";
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

export function createDefaultAgentSurfaceTabs(): AgentSurfaceTabsState {
  const id = newTabId();
  return {
    tabs: [{ id, kind: "chat", title: "Chat" }],
    activeId: id,
  };
}

/**
 * Add or activate a surface tab.
 * Singleton kinds (files/plan/diff) re-activate an existing tab.
 * Multi kinds (browser/terminal/chat) always append.
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

export function updateAgentSurfaceTab(
  tabs: AgentSurfaceTab[],
  id: string,
  patch: Partial<Pick<AgentSurfaceTab, "title" | "resourceId">>,
): AgentSurfaceTab[] {
  return tabs.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab));
}

/**
 * Close a tab. Never leaves zero tabs — closing the last tab is a no-op.
 * When closing the active tab, activate the neighbor to the left (or right if first).
 */
export function closeAgentSurfaceTab(
  tabs: AgentSurfaceTab[],
  id: string,
  activeId: string,
): AgentSurfaceTabsState {
  if (tabs.length <= 1) {
    const only = tabs[0];
    if (only) return { tabs, activeId: only.id };
    return createDefaultAgentSurfaceTabs();
  }

  const index = tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return { tabs, activeId };

  const next = tabs.filter((tab) => tab.id !== id);
  if (activeId !== id) return { tabs: next, activeId };

  const neighbor = next[Math.max(0, index - 1)] ?? next[0]!;
  return { tabs: next, activeId: neighbor.id };
}

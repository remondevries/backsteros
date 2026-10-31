import type { ProjectChannelStatus } from "@backsteros/contracts";

/** Project option for the chat `/` menu and active project room badge. */
export type ChatProjectOption = {
  id: string;
  key: string;
  name: string;
  icon?: string | null;
  type?: string | null;
  /** Channel connect status (slash picker gates navigation on active + uri). */
  channelStatus?: ProjectChannelStatus | null;
  /** Active chat room URI when connected. */
  channelUri?: string | null;
  /** Needs-details deep link (`backsteros://chat/…?message=…`). */
  channelPendingLink?: string | null;
};

/**
 * True when the `/` picker may enter this project’s chat room (active + uri).
 * Everything else stays in the list as a muted Connect / status row.
 */
export function isChatProjectRoomReady(
  project: ChatProjectOption,
): boolean {
  const uri = project.channelUri?.trim() ?? "";
  return project.channelStatus === "active" && uri.length > 0;
}

export const CHAT_RECENT_PROJECTS_STORAGE_KEY =
  "backsteros:chat-recent-projects";
/** Max project rooms shown left of Judith / first agent in the chat header. */
export const CHAT_RECENT_PROJECTS_STRIP_LIMIT = 5;

export function projectCommandSlug(project: ChatProjectOption): string {
  const fromKey = project.key
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  if (fromKey) return fromKey;
  return project.name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function readRecentChatProjectIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CHAT_RECENT_PROJECTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (id): id is string => typeof id === "string" && id.trim().length > 0,
    );
  } catch {
    return [];
  }
}

export function rememberRecentChatProjectId(projectId: string): string[] {
  const id = projectId.trim();
  if (!id) return readRecentChatProjectIds();
  const next = [id, ...readRecentChatProjectIds().filter((entry) => entry !== id)].slice(
    0,
    12,
  );
  if (typeof window !== "undefined") {
    localStorage.setItem(CHAT_RECENT_PROJECTS_STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

/** Keep only recent ids that still exist in the workspace. */
export function filterRecentChatProjectIds(
  recentIds: readonly string[],
  existingProjectIds: ReadonlySet<string> | readonly string[],
): string[] {
  const existing =
    existingProjectIds instanceof Set
      ? existingProjectIds
      : new Set(existingProjectIds);
  return recentIds.filter((id) => existing.has(id));
}

/**
 * Drop recent ids that no longer exist in the workspace (deleted projects).
 * Persists when the list changes.
 */
export function pruneRecentChatProjectIds(
  existingProjectIds: ReadonlySet<string> | readonly string[],
): string[] {
  const current = readRecentChatProjectIds();
  const next = filterRecentChatProjectIds(current, existingProjectIds);
  if (
    next.length !== current.length &&
    typeof window !== "undefined"
  ) {
    localStorage.setItem(CHAT_RECENT_PROJECTS_STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

/** Recent ids first (that still exist), then remaining projects A→Z by name. */
export function orderChatProjects(
  projects: readonly ChatProjectOption[],
  recentIds: readonly string[],
): ChatProjectOption[] {
  const byId = new Map(projects.map((project) => [project.id, project]));
  const ordered: ChatProjectOption[] = [];
  const seen = new Set<string>();
  for (const id of recentIds) {
    const project = byId.get(id);
    if (!project || seen.has(project.id)) continue;
    ordered.push(project);
    seen.add(project.id);
  }
  const rest = projects
    .filter((project) => !seen.has(project.id))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...ordered, ...rest];
}

/**
 * Up to `limit` recent projects for the chat header strip, oldest → newest so
 * the most recent sits immediately left of Judith / the first agent. Always
 * includes `activeProjectId` when present (even if not in `recentIds`).
 */
export function resolveRecentChatProjectsForStrip(
  projects: readonly ChatProjectOption[],
  recentIds: readonly string[],
  activeProjectId: string | null = null,
  limit: number = CHAT_RECENT_PROJECTS_STRIP_LIMIT,
): ChatProjectOption[] {
  if (limit <= 0) return [];
  const byId = new Map(projects.map((project) => [project.id, project]));
  const mru: ChatProjectOption[] = [];
  const seen = new Set<string>();
  const prefer = activeProjectId?.trim() ? [activeProjectId.trim()] : [];
  for (const id of [...prefer, ...recentIds]) {
    const project = byId.get(id);
    if (!project || seen.has(project.id)) continue;
    mru.push(project);
    seen.add(project.id);
    if (mru.length >= limit) break;
  }
  // MRU is newest-first; reverse so newest is rightmost (left of agents).
  return mru.slice().reverse();
}

export function matchProjectsBySlashQuery(
  projects: readonly ChatProjectOption[],
  query: string,
  recentIds: readonly string[] = [],
): ChatProjectOption[] {
  const ordered = orderChatProjects(projects, recentIds);
  const q = query.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!q) return ordered;
  return ordered.filter((project) => {
    const keySlug = projectCommandSlug(project);
    const nameSlug = project.name
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
    const first = project.name
      .split(/\s+/)[0]
      ?.normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "") ?? "";
    return (
      keySlug.startsWith(q) ||
      nameSlug.startsWith(q) ||
      first.startsWith(q)
    );
  });
}

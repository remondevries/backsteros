/** Project option for the chat `/` menu and active project room badge. */
export type ChatProjectOption = {
  id: string;
  key: string;
  name: string;
  icon?: string | null;
  type?: string | null;
};

export const CHAT_EXIT_COMMAND = "exit";
export const CHAT_RECENT_PROJECTS_STORAGE_KEY =
  "backsteros:chat-recent-projects";

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

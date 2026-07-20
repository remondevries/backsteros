import type { MentionCatalog } from "./mention-menu-types.js";

function mergeUniqueById<T extends { id: string }>(
  existing: T[],
  incoming: T[],
): T[] {
  const seen = new Set(existing.map((entry) => entry.id));
  const additions: T[] = [];

  for (const entry of incoming) {
    if (seen.has(entry.id)) {
      continue;
    }
    seen.add(entry.id);
    additions.push(entry);
  }

  if (additions.length === 0) {
    return existing;
  }

  return [...existing, ...additions];
}

export function mergeMentionCatalogs(
  base: MentionCatalog,
  patch: MentionCatalog,
): MentionCatalog {
  const tasks = mergeUniqueById(base.tasks, patch.tasks);
  const projects = mergeUniqueById(base.projects, patch.projects);
  const contacts = mergeUniqueById(base.contacts, patch.contacts);
  const organizations = mergeUniqueById(base.organizations, patch.organizations);
  const documents = mergeUniqueById(base.documents, patch.documents);
  const letters = mergeUniqueById(base.letters, patch.letters);

  if (
    tasks === base.tasks &&
    projects === base.projects &&
    contacts === base.contacts &&
    organizations === base.organizations &&
    documents === base.documents &&
    letters === base.letters
  ) {
    return base;
  }

  return {
    tasks,
    projects,
    contacts,
    organizations,
    documents,
    letters,
  };
}

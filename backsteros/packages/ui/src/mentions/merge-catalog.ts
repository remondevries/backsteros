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

/** Habits may share an id across definition + day rows — key by id+date. */
function mergeHabits(
  existing: MentionCatalog["habits"],
  incoming: MentionCatalog["habits"],
): MentionCatalog["habits"] {
  const keyOf = (entry: MentionCatalog["habits"][number]) =>
    entry.date ? `${entry.id}:${entry.date}` : entry.id;
  const seen = new Set(existing.map(keyOf));
  const additions: MentionCatalog["habits"] = [];
  for (const entry of incoming) {
    const key = keyOf(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    additions.push(entry);
  }
  return additions.length === 0 ? existing : [...existing, ...additions];
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
  const emails = mergeUniqueById(base.emails, patch.emails);
  const meetings = mergeUniqueById(base.meetings, patch.meetings);
  const journals = mergeUniqueById(base.journals, patch.journals);
  const habits = mergeHabits(base.habits, patch.habits);
  const messages = mergeUniqueById(base.messages, patch.messages);
  const posts = mergeUniqueById(base.posts, patch.posts);
  const transactions = mergeUniqueById(base.transactions, patch.transactions);
  const invoices = mergeUniqueById(base.invoices, patch.invoices);
  const estimates = mergeUniqueById(base.estimates, patch.estimates);

  if (
    tasks === base.tasks &&
    projects === base.projects &&
    contacts === base.contacts &&
    organizations === base.organizations &&
    documents === base.documents &&
    letters === base.letters &&
    emails === base.emails &&
    meetings === base.meetings &&
    journals === base.journals &&
    habits === base.habits &&
    messages === base.messages &&
    posts === base.posts &&
    transactions === base.transactions &&
    invoices === base.invoices &&
    estimates === base.estimates
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
    emails,
    meetings,
    journals,
    habits,
    messages,
    posts,
    transactions,
    invoices,
    estimates,
  };
}

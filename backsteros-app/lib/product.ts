export type Entity = Record<string, unknown> & {
  id: string;
  name?: string;
  title?: string;
  key?: string;
  status?: string;
  summary?: string | null;
  updatedAt?: string;
};

export function entityTitle(entity: Entity) {
  return String(entity.name ?? entity.title ?? entity.key ?? entity.id);
}

export function slugKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

export function routeForSearchResult(type: string, id: string) {
  const family: Record<string, string> = {
    project: "projects",
    task: "tasks",
    document: "knowledge",
    organization: "organizations",
    contact: "contacts",
    letter: "letters",
  };
  return `/${family[type] ?? type}/${encodeURIComponent(id)}`;
}

export function localDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

export function inputDate(value?: string | null) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

export function toIsoDate(value: string) {
  return value ? new Date(`${value}T12:00:00`).toISOString() : null;
}

/** Tags embedded in TransIP domain project icon JSON (`{"t":"i","k":"transip","tags":[…]}`). */

export function parseTransipDomainTagsFromIcon(
  icon: string | null | undefined,
): string[] {
  const value = icon?.trim() ?? "";
  if (!value.startsWith("{")) return [];
  try {
    const parsed = JSON.parse(value) as { tags?: unknown };
    if (!Array.isArray(parsed.tags)) return [];
    return parsed.tags
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Entity-icon payload: TransIP mark + brand paint + optional registrar tags. */
export function buildTransipDomainProjectIcon(tags: string[] = []): string {
  const payload: Record<string, unknown> = {
    t: "i",
    k: "transip",
    c: "#408fce",
  };
  const cleaned = [
    ...new Set(
      tags
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
    ),
  ];
  if (cleaned.length > 0) payload.tags = cleaned;
  return JSON.stringify(payload);
}

export function formatDomainNameWithTags(
  name: string,
  tags: string[],
): string {
  if (tags.length === 0) return name;
  return `${name} ${tags.map((tag) => `[${tag}]`).join(" ")}`;
}

export function normalizeTransipDomainTags(tags: readonly string[]): string[] {
  return [
    ...new Set(
      tags
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
    ),
  ];
}

/** Unique tags across domain projects (icon payload), sorted. */
export function collectTransipDomainTagsFromProjects(
  projects: readonly { icon?: string | null }[],
): string[] {
  const tags = new Set<string>();
  for (const project of projects) {
    for (const tag of parseTransipDomainTagsFromIcon(project.icon)) {
      tags.add(tag);
    }
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}

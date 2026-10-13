/** Email providers for Catalog email projects. */
export const PROJECT_EMAIL_CATEGORIES = [
  "lemo_hosting",
  "google_workspaces",
  "office365",
  "proton",
] as const;

export type ProjectEmailCategory = (typeof PROJECT_EMAIL_CATEGORIES)[number];

export const PROJECT_EMAIL_CATEGORY_LABELS: Record<
  ProjectEmailCategory,
  string
> = {
  lemo_hosting: "Lemo-Hosting",
  google_workspaces: "Google Workspaces",
  office365: "Office365",
  proton: "Proton",
};

export const PROJECT_EMAIL_CATEGORY_ORDER: ProjectEmailCategory[] = [
  ...PROJECT_EMAIL_CATEGORIES,
];

/** Default project icon key when an email category is selected. */
export const PROJECT_EMAIL_CATEGORY_ICON_KEYS: Record<
  ProjectEmailCategory,
  string
> = {
  lemo_hosting: "mail",
  google_workspaces: "mail",
  office365: "mail",
  proton: "mail",
};

/** Default paint color baked into the entity-icon JSON payload. */
export const PROJECT_EMAIL_CATEGORY_ICON_COLORS: Record<
  ProjectEmailCategory,
  string
> = {
  lemo_hosting: "#0EA5E9",
  google_workspaces: "#4285F4",
  office365: "#D83B01",
  proton: "#6D4AFF",
};

/**
 * Serialized entity-icon value (`{"t":"i","k":…,"c":…}`) for a category default.
 */
export function getProjectEmailCategoryDefaultIcon(
  category: ProjectEmailCategory,
): string {
  return JSON.stringify({
    t: "i",
    k: PROJECT_EMAIL_CATEGORY_ICON_KEYS[category],
    c: PROJECT_EMAIL_CATEGORY_ICON_COLORS[category],
  });
}

export function isProjectEmailCategory(
  value: string,
): value is ProjectEmailCategory {
  return (PROJECT_EMAIL_CATEGORIES as readonly string[]).includes(value);
}

export function getProjectEmailCategoryLabel(
  category: ProjectEmailCategory,
): string {
  return PROJECT_EMAIL_CATEGORY_LABELS[category];
}

export function parseProjectEmailCategory(
  value: string | null | undefined,
): ProjectEmailCategory | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  return isProjectEmailCategory(trimmed) ? trimmed : null;
}

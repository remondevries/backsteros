/** Registrar / hosting providers for Catalog Domains (and future project kinds). */
export const PROJECT_PROVIDERS = ["transip"] as const;

export type ProjectProvider = (typeof PROJECT_PROVIDERS)[number];

export const PROJECT_PROVIDER_LABELS: Record<ProjectProvider, string> = {
  transip: "TransIP",
};

export const PROJECT_PROVIDER_ORDER: ProjectProvider[] = [...PROJECT_PROVIDERS];

/** Default project icon key when a provider is selected. */
export const PROJECT_PROVIDER_ICON_KEYS: Record<ProjectProvider, string> = {
  transip: "transip",
};

export function isProjectProvider(value: string): value is ProjectProvider {
  return (PROJECT_PROVIDERS as readonly string[]).includes(value);
}

export function getProjectProviderLabel(provider: ProjectProvider): string {
  return PROJECT_PROVIDER_LABELS[provider];
}

export function parseProjectProvider(
  value: string | null | undefined,
): ProjectProvider | null {
  if (!value?.trim()) return null;
  return isProjectProvider(value.trim()) ? value.trim() : null;
}

/**
 * Match Kamal/Docker container names to a proxy service (Forge-style site scope).
 */
export function appKeyFromService(serviceName: string): string {
  return serviceName.replace(/-web$/u, "");
}

export function normalizeServiceScope(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function containerMatchesService(containerName: string, service: string): boolean {
  const scoped = normalizeServiceScope(service);
  if (!scoped) return true;
  if (containerName === scoped || containerName.startsWith(`${scoped}-`)) return true;
  const appKey = appKeyFromService(scoped);
  if (appKey !== scoped) {
    if (containerName === appKey || containerName.startsWith(`${appKey}-`)) return true;
  }
  return false;
}

export function matchesServiceScope(
  entryService: string | null | undefined,
  filter: string | null | undefined,
): boolean {
  const scoped = normalizeServiceScope(entryService ?? null);
  if (filter === undefined) return true;
  const wanted = normalizeServiceScope(filter);
  if (wanted == null) return scoped == null;
  return scoped === wanted;
}

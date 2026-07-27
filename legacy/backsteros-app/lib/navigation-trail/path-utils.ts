export function isValidInternalPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) {
    return false;
  }

  return !path.includes("\\");
}

export function buildCurrentLocationHref(
  pathname: string,
  searchParams: Pick<URLSearchParams, "toString">,
): string {
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

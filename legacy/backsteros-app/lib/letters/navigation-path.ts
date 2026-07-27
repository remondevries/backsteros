import { encodeLetterSlug, encodeProjectSlug } from "@/lib/entity-slugs";

const PROJECT_LETTERS_PATH =
  /^\/(?:projects\/[^/]+|organizations\/[^/]+\/projects\/[^/]+)\/letters/;

export function isLetterComposePath(pathname: string): boolean {
  return pathname === "/letters/new" || /\/letters\/new$/.test(pathname);
}

/** Strip Next `basePath` (`/app`) when present. */
function normalizeProductPathname(pathname: string): string {
  if (pathname === "/app" || pathname.startsWith("/app/")) {
    return pathname.slice("/app".length) || "/";
  }
  return pathname;
}

export function getSelectedLetterSlugFromPathname(
  pathname: string,
): string | undefined {
  const path = normalizeProductPathname(pathname);
  if (isLetterComposePath(path)) {
    return undefined;
  }

  const globalMatch = path.match(/^\/letters\/([^/]+)$/);
  if (globalMatch && globalMatch[1] !== "new") {
    return decodeURIComponent(globalMatch[1]!);
  }

  const projectMatch = path.match(/^\/projects\/[^/]+\/letters\/([^/]+)$/);
  if (projectMatch) {
    return decodeURIComponent(projectMatch[1]!);
  }

  const orgLetterMatch = path.match(
    /^\/organizations\/[^/]+\/letters\/([^/]+)$/,
  );
  if (orgLetterMatch) {
    return decodeURIComponent(orgLetterMatch[1]!);
  }

  const contactLetterMatch = path.match(
    /^\/contacts\/[^/]+\/letters\/([^/]+)$/,
  );
  if (contactLetterMatch) {
    return decodeURIComponent(contactLetterMatch[1]!);
  }

  return undefined;
}

export function letterMatchesRouteSlug(
  letterNumber: number,
  routeSlug: string | null | undefined,
): boolean {
  if (!routeSlug) {
    return false;
  }

  const normalized = routeSlug.toLowerCase();
  return (
    encodeLetterSlug(letterNumber) === normalized ||
    String(letterNumber) === normalized
  );
}

export function getProjectLettersHref(projectKey: string): string {
  return `/projects/${encodeProjectSlug(projectKey)}/letters`;
}

export function isProjectLettersSectionPath(pathname: string): boolean {
  return PROJECT_LETTERS_PATH.test(normalizeProductPathname(pathname));
}

export function isProjectLetterDetailPath(pathname: string): boolean {
  const path = normalizeProductPathname(pathname);
  return (
    /^\/(?:projects\/[^/]+|organizations\/[^/]+\/projects\/[^/]+)\/letters\/[^/]+$/.test(
      path,
    ) && !isLetterComposePath(path)
  );
}

export function isLettersSectionPath(pathname: string): boolean {
  const path = normalizeProductPathname(pathname);
  return path === "/letters" || path.startsWith("/letters/");
}

export function isLetterDetailPath(pathname: string): boolean {
  const path = normalizeProductPathname(pathname);
  return (
    (/^\/letters\/[^/]+$/.test(path) && !isLetterComposePath(path)) ||
    /^\/projects\/[^/]+\/letters\/[^/]+$/.test(path) ||
    /^\/organizations\/[^/]+\/letters\/[^/]+$/.test(path) ||
    /^\/contacts\/[^/]+\/letters\/[^/]+$/.test(path) ||
    /^\/organizations\/[^/]+\/contacts\/[^/]+\/letters\/[^/]+$/.test(path) ||
    /^\/organizations\/[^/]+\/projects\/[^/]+\/letters\/[^/]+$/.test(path)
  );
}

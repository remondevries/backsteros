import { encodeLetterSlug, encodeProjectSlug } from "@/lib/entity-slugs";

const PROJECT_LETTERS_PATH =
  /^\/(?:projects\/[^/]+|organizations\/[^/]+\/projects\/[^/]+)\/letters/;

export function isLetterComposePath(pathname: string): boolean {
  return pathname === "/letters/new" || /\/letters\/new$/.test(pathname);
}

export function getSelectedLetterSlugFromPathname(
  pathname: string,
): string | undefined {
  if (isLetterComposePath(pathname)) {
    return undefined;
  }

  const globalMatch = pathname.match(/^\/letters\/([^/]+)$/);
  if (globalMatch && globalMatch[1] !== "new") {
    return decodeURIComponent(globalMatch[1]!);
  }

  const projectMatch = pathname.match(/^\/projects\/[^/]+\/letters\/([^/]+)$/);
  if (projectMatch) {
    return decodeURIComponent(projectMatch[1]!);
  }

  const orgLetterMatch = pathname.match(
    /^\/organizations\/[^/]+\/letters\/([^/]+)$/,
  );
  if (orgLetterMatch) {
    return decodeURIComponent(orgLetterMatch[1]!);
  }

  const contactLetterMatch = pathname.match(
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
  return PROJECT_LETTERS_PATH.test(pathname);
}

export function isProjectLetterDetailPath(pathname: string): boolean {
  return (
    /^\/(?:projects\/[^/]+|organizations\/[^/]+\/projects\/[^/]+)\/letters\/[^/]+$/.test(
      pathname,
    ) && !isLetterComposePath(pathname)
  );
}

export function isLettersSectionPath(pathname: string): boolean {
  return pathname === "/letters" || pathname.startsWith("/letters/");
}

export function isLetterDetailPath(pathname: string): boolean {
  return (
    (/^\/letters\/[^/]+$/.test(pathname) && !isLetterComposePath(pathname)) ||
    /^\/projects\/[^/]+\/letters\/[^/]+$/.test(pathname) ||
    /^\/organizations\/[^/]+\/letters\/[^/]+$/.test(pathname) ||
    /^\/contacts\/[^/]+\/letters\/[^/]+$/.test(pathname) ||
    /^\/organizations\/[^/]+\/contacts\/[^/]+\/letters\/[^/]+$/.test(pathname) ||
    /^\/organizations\/[^/]+\/projects\/[^/]+\/letters\/[^/]+$/.test(pathname)
  );
}

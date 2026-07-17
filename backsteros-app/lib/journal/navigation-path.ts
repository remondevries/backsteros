export function getJournalHref(dateSlug?: string): string {
  if (!dateSlug) {
    return "/journal";
  }

  return `/journal/${dateSlug}`;
}

export function getSelectedJournalDateFromPathname(
  pathname: string,
): string | undefined {
  const match = pathname.match(/^\/journal\/([^/]+)(?:\/|$)/);
  if (!match) {
    return undefined;
  }

  return decodeURIComponent(match[1]!);
}

export function isJournalDetailPath(pathname: string): boolean {
  return /^\/journal\/[^/]+$/.test(pathname);
}

export function isJournalSectionPath(pathname: string): boolean {
  return pathname === "/journal" || pathname.startsWith("/journal/");
}

export function isJournalPath(pathname: string): boolean {
  return isJournalSectionPath(pathname);
}

export function getJournalNavigationPath(...args: unknown[]) {
  void args;
  return null;
}

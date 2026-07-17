export function getKnowledgeDocumentsSectionHref(): string {
  return "/knowledge";
}

export function getKnowledgeDocumentHref(relativePath: string): string {
  const encoded = encodeURIComponent(relativePath).replace(/%2F/gi, "/");
  if (!encoded) {
    return getKnowledgeDocumentsSectionHref();
  }

  return `${getKnowledgeDocumentsSectionHref()}/${encoded}`;
}

export function getSelectedKnowledgeDocumentPathFromPathname(
  pathname: string,
): string | undefined {
  const match = pathname.match(/^\/knowledge\/(.+)$/);
  if (!match) {
    return undefined;
  }

  return decodeURIComponent(match[1]!);
}

export function isKnowledgeDocumentDetailPath(pathname: string): boolean {
  return /^\/knowledge\/.+/.test(pathname);
}

export function isKnowledgeSectionPath(pathname: string): boolean {
  return /^\/knowledge(\/|$)/.test(pathname);
}

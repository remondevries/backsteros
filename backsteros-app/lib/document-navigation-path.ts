import { encodeProjectSlug } from "@/lib/entity-slugs";
import {
  getProjectRouteScopeFromPathname,
  getScopedProjectBasePath,
  type ProjectRouteScope,
} from "@/lib/project-route-scope";

const PROJECT_DOCUMENTS_PATH =
  /^\/(?:projects\/[^/]+|organizations\/[^/]+\/projects\/[^/]+)\/documents/;

export function getProjectDocumentsSectionHref(
  projectKey: string,
  scope?: ProjectRouteScope,
): string {
  const resolvedScope = scope ?? { kind: "standalone" as const };
  return `${getScopedProjectBasePath(
    encodeProjectSlug(projectKey),
    resolvedScope,
  )}/documents`;
}

export function getProjectDocumentHref(
  projectKey: string,
  relativePath: string,
  scope?: ProjectRouteScope,
): string {
  const encoded = encodeURIComponent(relativePath).replace(/%2F/gi, "/");
  if (!encoded) {
    return getProjectDocumentsSectionHref(projectKey, scope);
  }

  return `${getProjectDocumentsSectionHref(projectKey, scope)}/${encoded}`;
}

export function getProjectDocumentHrefFromPathname(
  pathname: string,
  projectKey: string,
  relativePath: string,
): string {
  return getProjectDocumentHref(
    projectKey,
    relativePath,
    getProjectRouteScopeFromPathname(pathname),
  );
}

export function getProjectRouteParamFromDocumentsPath(
  pathname: string,
): string | null {
  const standalone = pathname.match(/^\/projects\/([^/]+)\/documents(?:\/|$)/);
  if (standalone) {
    return decodeURIComponent(standalone[1]!);
  }

  const orgScoped = pathname.match(
    /^\/organizations\/[^/]+\/projects\/([^/]+)\/documents(?:\/|$)/,
  );
  if (orgScoped) {
    return decodeURIComponent(orgScoped[1]!);
  }

  return null;
}

export function getSelectedDocumentPathFromPathname(
  pathname: string,
): string | undefined {
  const match = pathname.match(
    /^\/(?:projects\/[^/]+|organizations\/[^/]+\/projects\/[^/]+)\/documents\/(.+)$/,
  );
  if (!match) {
    return undefined;
  }

  return decodeURIComponent(match[1]!);
}

export function isProjectDocumentDetailPath(pathname: string): boolean {
  return /^\/(?:projects\/[^/]+|organizations\/[^/]+\/projects\/[^/]+)\/documents\/.+/.test(
    pathname,
  );
}

export function isProjectDocumentsSectionPath(pathname: string): boolean {
  return PROJECT_DOCUMENTS_PATH.test(pathname);
}

export function getDocumentNavigationPath(...args: unknown[]) {
  void args;
  return null;
}

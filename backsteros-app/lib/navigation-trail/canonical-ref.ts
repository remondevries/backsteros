import type { NavigationTrailEntityRef } from "./types";

export function getNavigationTrailRefFromCanonicalHref(
  href: string,
): NavigationTrailEntityRef | null {
  let pathname: string;
  try {
    pathname = new URL(href, "http://internal").pathname;
  } catch {
    return null;
  }

  const projectTask = pathname.match(
    /^\/projects\/[^/]+\/tasks\/([^/]+)$/,
  );
  if (projectTask) {
    return {
      kind: "task",
      routeParam: decodeURIComponent(projectTask[1]!),
    };
  }

  const contactTask = pathname.match(
    /^\/contacts\/[^/]+\/tasks\/([^/]+)$/,
  );
  if (contactTask) {
    return {
      kind: "task",
      routeParam: decodeURIComponent(contactTask[1]!),
    };
  }

  const inboxTask = pathname.match(/^\/inbox\/([^/]+)$/);
  if (inboxTask) {
    return {
      kind: "task",
      routeParam: decodeURIComponent(inboxTask[1]!),
    };
  }

  const projectDocument = pathname.match(
    /^\/projects\/([^/]+)\/documents\/(.+)$/,
  );
  if (projectDocument) {
    return {
      kind: "document",
      projectRouteParam: decodeURIComponent(projectDocument[1]!),
      relativePath: projectDocument[2]!
        .split("/")
        .map(decodeURIComponent)
        .join("/"),
    };
  }

  const project = pathname.match(/^\/projects\/([^/]+)$/);
  if (project) {
    return {
      kind: "project",
      routeParam: decodeURIComponent(project[1]!),
    };
  }

  const contact = pathname.match(/^\/contacts\/([^/]+)$/);
  if (contact) {
    return {
      kind: "contact",
      routeParam: decodeURIComponent(contact[1]!),
    };
  }

  const organization = pathname.match(/^\/organizations\/([^/]+)$/);
  if (organization) {
    return {
      kind: "organization",
      routeParam: decodeURIComponent(organization[1]!),
    };
  }

  const letter = pathname.match(/^\/letters\/([^/]+)$/);
  if (letter) {
    return {
      kind: "letter",
      routeParam: decodeURIComponent(letter[1]!),
    };
  }

  return null;
}

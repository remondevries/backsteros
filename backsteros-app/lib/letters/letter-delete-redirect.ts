import type { Letter } from "@/lib/db/schema";
import {
  getLettersHref,
  getProjectLetterHref,
} from "@/lib/entity-route-hrefs";
import { getProjectLettersHref } from "@/lib/letters/navigation-path";
import { groupLettersByStatus } from "@/lib/letters/group-letters-by-status";
import { pickNextItemAfterRemoval } from "@/lib/list-delete-redirect";
import {
  getScopedProjectLetterHref,
} from "@/lib/project-route-scope";

/** Letters in the same side-panel list order used for keyboard navigation. */
export function flattenLettersInListOrder(letters: Letter[]): Letter[] {
  return groupLettersByStatus(letters).flatMap((group) => group.letters);
}

export function filterLettersForDeleteScope(
  pathname: string,
  deleted: Letter,
  letters: Letter[],
): Letter[] {
  if (pathname.startsWith("/inbox/")) {
    return letters.filter((letter) => letter.status === "triage");
  }

  if (
    /\/contacts\/[^/]+\/letters(?:\/|$)/.test(pathname) ||
    /^\/contacts\/[^/]+\/letters(?:\/|$)/.test(pathname)
  ) {
    return deleted.contactId
      ? letters.filter((letter) => letter.contactId === deleted.contactId)
      : letters;
  }

  if (/\/organizations\/[^/]+\/letters(?:\/|$)/.test(pathname)) {
    return deleted.organizationId
      ? letters.filter(
          (letter) => letter.organizationId === deleted.organizationId,
        )
      : letters;
  }

  if (
    /^\/projects\/[^/]+\/letters(?:\/|$)/.test(pathname) ||
    /^\/organizations\/[^/]+\/projects\/[^/]+\/letters(?:\/|$)/.test(pathname)
  ) {
    return deleted.projectId
      ? letters.filter((letter) => letter.projectId === deleted.projectId)
      : letters;
  }

  return letters;
}

/** Section index when no next letter remains (empty → compose UI). */
export function getLetterDeleteSectionHref(
  pathname: string,
  projectKey?: string | null,
): string {
  if (pathname.startsWith("/inbox/")) {
    return "/inbox";
  }

  const orgContact = pathname.match(
    /^\/organizations\/([^/]+)\/contacts\/([^/]+)\/letters(?:\/|$)/,
  );
  if (orgContact) {
    return `/organizations/${orgContact[1]}/contacts/${orgContact[2]}/letters`;
  }

  const contact = pathname.match(/^\/contacts\/([^/]+)\/letters(?:\/|$)/);
  if (contact) {
    return `/contacts/${contact[1]}/letters`;
  }

  const orgProject = pathname.match(
    /^\/organizations\/([^/]+)\/projects\/([^/]+)\/letters(?:\/|$)/,
  );
  if (orgProject) {
    return `/organizations/${orgProject[1]}/projects/${orgProject[2]}/letters`;
  }

  const orgLetter = pathname.match(
    /^\/organizations\/([^/]+)\/letters(?:\/|$)/,
  );
  if (orgLetter) {
    return `/organizations/${orgLetter[1]}/letters`;
  }

  const project = pathname.match(/^\/projects\/([^/]+)\/letters(?:\/|$)/);
  if (project) {
    return `/projects/${project[1]}/letters`;
  }

  if (projectKey) {
    return getProjectLettersHref(projectKey);
  }

  return "/letters";
}

function getLetterDetailHrefAfterDelete(
  letter: Letter,
  pathname: string,
  projectKey: string | null,
): string {
  if (letter.number == null) {
    return `/letters/${encodeURIComponent(letter.id)}`;
  }

  const orgProject = pathname.match(
    /^\/organizations\/([^/]+)\/projects\/([^/]+)\/letters(?:\/|$)/,
  );
  if (orgProject && projectKey) {
    return getScopedProjectLetterHref(projectKey, letter.number, {
      kind: "organization",
      organizationRouteParam: decodeURIComponent(orgProject[1]!),
    });
  }

  if (
    /^\/projects\/[^/]+\/letters(?:\/|$)/.test(pathname) &&
    projectKey
  ) {
    return getProjectLetterHref(projectKey, letter.number);
  }

  if (projectKey && letter.projectId) {
    if (/\/projects\/[^/]+\/letters(?:\/|$)/.test(pathname)) {
      return getProjectLetterHref(projectKey, letter.number);
    }
  }

  return getLettersHref(letter.number);
}

/**
 * After deleting a letter: next in list order, or the section index (compose empty).
 */
export function resolveLetterDeleteRedirectHref(input: {
  pathname: string;
  deletedLetter: Letter;
  letters: Letter[];
  projectKey?: string | null;
}): string {
  const scoped = filterLettersForDeleteScope(
    input.pathname,
    input.deletedLetter,
    input.letters,
  );
  const ordered = flattenLettersInListOrder(scoped);
  const next = pickNextItemAfterRemoval(
    ordered,
    (letter) => letter.id === input.deletedLetter.id,
  );

  if (!next) {
    return getLetterDeleteSectionHref(
      input.pathname,
      input.projectKey ?? null,
    );
  }

  return getLetterDetailHrefAfterDelete(
    next,
    input.pathname,
    input.projectKey ?? null,
  );
}

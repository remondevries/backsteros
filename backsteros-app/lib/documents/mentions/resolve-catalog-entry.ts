import type {
  MentionCatalog,
  MentionCatalogContact,
  MentionCatalogDocument,
  MentionCatalogOrganization,
  MentionCatalogProject,
  MentionCatalogTask,
  ParsedMentionToken,
} from "./mention-menu-types";

export function resolveMentionCatalogTask(
  parsed: ParsedMentionToken,
  catalog: MentionCatalog,
): MentionCatalogTask | null {
  if (parsed.kind !== "task") {
    return null;
  }

  return (
    catalog.tasks.find(
      (entry) =>
        entry.displayId.toLowerCase() === parsed.displayId.toLowerCase(),
    ) ?? null
  );
}

export function resolveMentionCatalogProject(
  parsed: ParsedMentionToken,
  catalog: MentionCatalog,
): MentionCatalogProject | null {
  if (parsed.kind !== "project") {
    return null;
  }

  return (
    catalog.projects.find(
      (entry) => entry.key.toLowerCase() === parsed.key.toLowerCase(),
    ) ?? null
  );
}

export function resolveMentionCatalogContact(
  parsed: ParsedMentionToken,
  catalog: MentionCatalog,
): MentionCatalogContact | null {
  if (parsed.kind !== "contact") {
    return null;
  }

  return (
    catalog.contacts.find(
      (entry) => entry.key.toLowerCase() === parsed.key.toLowerCase(),
    ) ?? null
  );
}

export function resolveMentionCatalogOrganization(
  parsed: ParsedMentionToken,
  catalog: MentionCatalog,
): MentionCatalogOrganization | null {
  if (parsed.kind !== "organization") {
    return null;
  }

  return (
    catalog.organizations.find(
      (entry) => entry.key.toLowerCase() === parsed.key.toLowerCase(),
    ) ?? null
  );
}

export function resolveMentionCatalogDocument(
  parsed: ParsedMentionToken,
  catalog: MentionCatalog,
): MentionCatalogDocument | null {
  if (parsed.kind !== "document") {
    return null;
  }

  return (
    catalog.documents.find(
      (entry) =>
        entry.projectKey.toLowerCase() === parsed.projectKey.toLowerCase() &&
        entry.relativePath.toLowerCase() === parsed.relativePath.toLowerCase(),
    ) ?? null
  );
}

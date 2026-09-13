import type { KnowledgeListItem } from "../navigation/entity-routes.js";
import {
  HELP_ARTICLE_AUDIENCE_GROUP,
  HELP_ARTICLE_AUDIENCE_INDIVIDUAL,
  type HelpArticleAudience,
} from "./help-article-properties.js";
import {
  collectHelpArticleIndividualTreeIds,
  findHelpArticleIndividualRoot,
  isHelpArticleIndividualRootFolder,
} from "./help-article-individual-folder.js";
import { resolveHelpArticleAudience } from "./help-article-scope-storage.js";

export type HelpArticlePlacementFolder = {
  id: string;
  title: string;
  path: string;
};

function sortFoldersByPath(
  folders: readonly KnowledgeListItem[],
): HelpArticlePlacementFolder[] {
  return folders
    .slice()
    .sort((a, b) => {
      const pathCmp = (a.path ?? "").localeCompare(b.path ?? "");
      if (pathCmp !== 0) return pathCmp;
      return a.title.localeCompare(b.title);
    })
    .map((folder) => ({
      id: folder.id,
      title: folder.title,
      path: folder.path ?? folder.id,
    }));
}

/**
 * Group (public) folders available as “Appears in” targets for Individual
 * articles. Excludes the reserved `_individual` tree.
 */
export function listHelpArticlePlacementFolders(
  documents: readonly KnowledgeListItem[],
  audienceById: Record<string, HelpArticleAudience> = {},
): HelpArticlePlacementFolder[] {
  const individualTreeIds = collectHelpArticleIndividualTreeIds(documents);
  const folders = documents.filter(
    (doc) =>
      doc.kind === "folder" &&
      !isHelpArticleIndividualRootFolder(doc) &&
      !individualTreeIds.has(doc.id),
  );
  if (folders.length === 0) return [];

  // Prefer folders that contain at least one Group article; still include
  // empty folders so authors can place into a section before writing Group docs.
  const groupDocParentIds = new Set<string>();
  for (const doc of documents) {
    if (doc.kind === "folder") continue;
    if (individualTreeIds.has(doc.id)) continue;
    if (
      resolveHelpArticleAudience(doc.id, audienceById) !==
      HELP_ARTICLE_AUDIENCE_GROUP
    ) {
      continue;
    }
    if (doc.parentId) groupDocParentIds.add(doc.parentId);
  }

  return folders
    .slice()
    .sort((a, b) => {
      const aGroup = groupDocParentIds.has(a.id) ? 0 : 1;
      const bGroup = groupDocParentIds.has(b.id) ? 0 : 1;
      if (aGroup !== bGroup) return aGroup - bGroup;
      const pathCmp = (a.path ?? "").localeCompare(b.path ?? "");
      if (pathCmp !== 0) return pathCmp;
      return a.title.localeCompare(b.title);
    })
    .map((folder) => ({
      id: folder.id,
      title: folder.title,
      path: folder.path ?? folder.id,
    }));
}

/**
 * Folders an article can move into for the active Group / Individual list.
 * Excludes the space root and the reserved `_individual` root (those are the
 * “No folder” / list-root targets handled by the Folder property).
 */
export function listHelpArticleMoveFolders(
  documents: readonly KnowledgeListItem[],
  audience: HelpArticleAudience,
  spaceRootId?: string | null,
): HelpArticlePlacementFolder[] {
  const individualRoot = findHelpArticleIndividualRoot(documents);
  const individualTreeIds = collectHelpArticleIndividualTreeIds(
    documents,
    individualRoot?.id ?? null,
  );
  const rootId = spaceRootId?.trim() || null;

  if (audience === HELP_ARTICLE_AUDIENCE_INDIVIDUAL) {
    if (!individualRoot) return [];
    return sortFoldersByPath(
      documents.filter(
        (doc) =>
          doc.kind === "folder" &&
          doc.id !== individualRoot.id &&
          doc.id !== rootId &&
          individualTreeIds.has(doc.id),
      ),
    );
  }

  return sortFoldersByPath(
    documents.filter(
      (doc) =>
        doc.kind === "folder" &&
        doc.id !== rootId &&
        !isHelpArticleIndividualRootFolder(doc) &&
        !individualTreeIds.has(doc.id),
    ),
  );
}

/**
 * Effective parent folder id for the Folder property. Treats space root /
 * Individual root / missing parent as “No folder” (null).
 */
export function resolveHelpArticleFolderId(
  document: Pick<KnowledgeListItem, "parentId"> | null | undefined,
  options: {
    audience: HelpArticleAudience;
    spaceRootId?: string | null;
    individualRootId?: string | null;
  },
): string | null {
  const parentId = document?.parentId?.trim() || null;
  if (!parentId) return null;
  if (options.spaceRootId && parentId === options.spaceRootId) return null;
  if (
    options.audience === HELP_ARTICLE_AUDIENCE_INDIVIDUAL &&
    options.individualRootId &&
    parentId === options.individualRootId
  ) {
    return null;
  }
  return parentId;
}

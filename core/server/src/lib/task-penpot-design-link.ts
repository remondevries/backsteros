import {
  coercePenpotDesignUrl,
  parsePenpotDesignLink,
  type TaskLink,
} from "@backsteros/contracts";

export type TaskPenpotDesignFields = {
  penpotFileId: string | null;
  penpotPageId: string | null;
  penpotObjectId: string | null;
};

/** Coerce design https URLs inside task.links to `backsterdesign://…`. */
export function normalizeTaskLinkUrls(links: TaskLink[]): TaskLink[] {
  return links.map((link) => {
    const design = coercePenpotDesignUrl(link.url);
    if (!design || design === link.url) {
      return link;
    }
    return { ...link, url: design };
  });
}

/**
 * First design link wins. Empty / no-design links clear the fields.
 */
export function penpotFieldsFromTaskLinks(
  links: TaskLink[] | null | undefined,
): TaskPenpotDesignFields {
  if (!links?.length) {
    return {
      penpotFileId: null,
      penpotPageId: null,
      penpotObjectId: null,
    };
  }
  for (const link of links) {
    const parsed = parsePenpotDesignLink(link.url);
    if (parsed) {
      return {
        penpotFileId: parsed.fileId,
        penpotPageId: parsed.pageId ?? null,
        penpotObjectId: parsed.boardId ?? null,
      };
    }
  }
  return {
    penpotFileId: null,
    penpotPageId: null,
    penpotObjectId: null,
  };
}

/**
 * Prefer explicit input fields; otherwise derive from normalized links.
 */
export function resolveTaskPenpotDesignFields(input: {
  links?: TaskLink[] | null;
  penpotFileId?: string | null;
  penpotPageId?: string | null;
  penpotObjectId?: string | null;
  /** When true, missing explicit fields fall back to link derivation. */
  deriveFromLinks?: boolean;
}): TaskPenpotDesignFields {
  const fromLinks =
    input.deriveFromLinks === false
      ? null
      : penpotFieldsFromTaskLinks(input.links);

  return {
    penpotFileId:
      input.penpotFileId !== undefined
        ? input.penpotFileId
        : (fromLinks?.penpotFileId ?? null),
    penpotPageId:
      input.penpotPageId !== undefined
        ? input.penpotPageId
        : (fromLinks?.penpotPageId ?? null),
    penpotObjectId:
      input.penpotObjectId !== undefined
        ? input.penpotObjectId
        : (fromLinks?.penpotObjectId ?? null),
  };
}

export const COMPOSE_DOCUMENT_ROOT_FOLDER_VALUE = "__document_root__";

export type ComposeDocumentFolderOption = {
  value: string;
  label: string;
  folderPath: string;
  searchTerms: string;
};

export type ComposeDocumentFoldersByTarget = Record<
  string,
  ComposeDocumentFolderOption[]
>;

export function folderPathFromComposeFolderValue(value: string): string {
  return value === COMPOSE_DOCUMENT_ROOT_FOLDER_VALUE ? "" : value;
}

/** Parent folder path for `foo/bar.md` → `foo`; for `foo.md` → ``. */
export function getParentFolderPath(relativePath: string): string {
  const trimmed = relativePath.replace(/\/+$/, "");
  const index = trimmed.lastIndexOf("/");
  return index === -1 ? "" : trimmed.slice(0, index);
}

/** Selected document path from project documents (standalone or org-scoped). */
export function getSelectedProjectDocumentPathFromPathname(
  pathname: string,
): string | undefined {
  const match =
    pathname.match(
      /^\/organizations\/[^/]+\/projects\/[^/]+\/documents\/(.+)$/,
    ) ?? pathname.match(/^\/projects\/[^/]+\/documents\/(.+)$/);
  if (!match) {
    return undefined;
  }

  return decodeURIComponent(match[1]!);
}

/** Selected document path from `/knowledge/:slug`. */
export function getSelectedKnowledgeDocumentPathFromPathname(
  pathname: string,
): string | undefined {
  const match = pathname.match(/^\/knowledge\/(.+)$/);
  if (!match) {
    return undefined;
  }

  return decodeURIComponent(match[1]!);
}

export function resolveComposeContextDocumentFolder(pathname: string): string {
  const documentPath =
    getSelectedProjectDocumentPathFromPathname(pathname) ??
    getSelectedKnowledgeDocumentPathFromPathname(pathname);

  if (!documentPath) {
    return "";
  }

  return getParentFolderPath(documentPath);
}

export function resolveComposeDocumentFolderValue(
  targetId: string | null | undefined,
  pathname: string,
  contextTargetId: string | null,
  foldersByTarget: ComposeDocumentFoldersByTarget,
): string {
  if (!targetId) {
    return COMPOSE_DOCUMENT_ROOT_FOLDER_VALUE;
  }

  const options = foldersByTarget[targetId];
  if (!options?.length) {
    return COMPOSE_DOCUMENT_ROOT_FOLDER_VALUE;
  }

  if (contextTargetId !== targetId) {
    return COMPOSE_DOCUMENT_ROOT_FOLDER_VALUE;
  }

  const contextFolderPath = resolveComposeContextDocumentFolder(pathname);
  const contextValue = contextFolderPath || COMPOSE_DOCUMENT_ROOT_FOLDER_VALUE;

  return options.some((option) => option.value === contextValue)
    ? contextValue
    : COMPOSE_DOCUMENT_ROOT_FOLDER_VALUE;
}

export type ComposeFolderCascadeSegment = {
  depth: number;
  parentPath: string;
  selectedValue: string | null;
  options: ComposeDocumentFolderOption[];
};

export function getDirectChildComposeFolderOptions(
  folders: ComposeDocumentFolderOption[],
  parentPath: string,
): ComposeDocumentFolderOption[] {
  return folders.filter((folder) => {
    if (!folder.folderPath) {
      return false;
    }

    return getParentFolderPath(folder.folderPath) === parentPath;
  });
}

export function getComposeFolderPathChain(folderPath: string): string[] {
  const normalized = folderPath.trim();
  if (!normalized) {
    return [];
  }

  const segments = normalized.split("/");
  const chain: string[] = [];

  for (let index = 0; index < segments.length; index += 1) {
    chain.push(segments.slice(0, index + 1).join("/"));
  }

  return chain;
}

function findRootFolderOption(
  allOptions: ComposeDocumentFolderOption[],
): ComposeDocumentFolderOption {
  const rootOption = allOptions.find(
    (option) => option.value === COMPOSE_DOCUMENT_ROOT_FOLDER_VALUE,
  );

  return (
    rootOption ?? {
      value: COMPOSE_DOCUMENT_ROOT_FOLDER_VALUE,
      label: "No folder",
      folderPath: "",
      searchTerms: "no folder top level",
    }
  );
}

export function buildComposeFolderCascadeSegments(
  allOptions: ComposeDocumentFolderOption[],
  selectedValue: string,
): ComposeFolderCascadeSegment[] {
  const folderOptions = allOptions.filter(
    (option) =>
      option.value !== COMPOSE_DOCUMENT_ROOT_FOLDER_VALUE && option.folderPath,
  );
  const rootChildren = getDirectChildComposeFolderOptions(folderOptions, "");

  if (rootChildren.length === 0) {
    return [];
  }

  const rootOption = findRootFolderOption(allOptions);
  const rootSegmentOptions = [rootOption, ...rootChildren];

  if (selectedValue === COMPOSE_DOCUMENT_ROOT_FOLDER_VALUE) {
    return [
      {
        depth: 0,
        parentPath: "",
        selectedValue: COMPOSE_DOCUMENT_ROOT_FOLDER_VALUE,
        options: rootSegmentOptions,
      },
    ];
  }

  const chain = getComposeFolderPathChain(selectedValue);
  if (chain.length === 0) {
    return [
      {
        depth: 0,
        parentPath: "",
        selectedValue: COMPOSE_DOCUMENT_ROOT_FOLDER_VALUE,
        options: rootSegmentOptions,
      },
    ];
  }

  const segments: ComposeFolderCascadeSegment[] = [
    {
      depth: 0,
      parentPath: "",
      selectedValue: chain[0]!,
      options: rootSegmentOptions,
    },
  ];

  for (let depth = 1; depth < chain.length; depth += 1) {
    const parentPath = chain[depth - 1]!;
    const selectedPath = chain[depth]!;
    const children = getDirectChildComposeFolderOptions(
      folderOptions,
      parentPath,
    );

    if (children.length === 0) {
      break;
    }

    segments.push({
      depth,
      parentPath,
      selectedValue: selectedPath,
      options: children,
    });
  }

  const deepestPath = chain[chain.length - 1]!;
  const tailChildren = getDirectChildComposeFolderOptions(
    folderOptions,
    deepestPath,
  );

  if (tailChildren.length > 0) {
    segments.push({
      depth: chain.length,
      parentPath: deepestPath,
      selectedValue: null,
      options: tailChildren,
    });
  }

  return segments;
}

/** Matches Next's `compose-modal-gate.tsx` — folder options grouped by knowledge base / project id. */
export function buildDocumentFoldersByTarget(
  documents: {
    path: string;
    title: string;
    kind: string;
    type: string;
    projectId?: string | null;
  }[],
  projects: { id: string }[],
  knowledgeBaseValue: string = "__knowledge_base__",
): ComposeDocumentFoldersByTarget {
  const result: ComposeDocumentFoldersByTarget = {};
  const folderDocs = documents.filter((doc) => doc.kind === "folder");

  const buildFolderOptions = (
    folderDocsForTarget: { path: string; title: string }[],
  ): ComposeDocumentFolderOption[] => {
    if (folderDocsForTarget.length === 0) {
      return [];
    }

    const titleByPath = new Map(
      folderDocsForTarget.map((doc) => [doc.path, doc.title]),
    );
    const options: ComposeDocumentFolderOption[] = [
      {
        value: COMPOSE_DOCUMENT_ROOT_FOLDER_VALUE,
        label: "No folder",
        folderPath: "",
        searchTerms: "no folder top level",
      },
    ];

    for (const doc of folderDocsForTarget) {
      const chain = getComposeFolderPathChain(doc.path);
      const label = chain
        .map((path) => titleByPath.get(path) ?? path.split("/").pop() ?? path)
        .join(" / ");
      options.push({
        value: doc.path,
        label,
        folderPath: doc.path,
        searchTerms: `${label} ${doc.path}`,
      });
    }

    return options;
  };

  for (const project of projects) {
    const projectFolders = folderDocs.filter(
      (doc) => doc.type === "project" && doc.projectId === project.id,
    );
    const options = buildFolderOptions(projectFolders);
    if (options.length > 0) {
      result[project.id] = options;
    }
  }

  const knowledgeOptions = buildFolderOptions(
    folderDocs.filter((doc) => doc.type === "knowledge"),
  );
  if (knowledgeOptions.length > 0) {
    result[knowledgeBaseValue] = knowledgeOptions;
  }

  return result;
}

import {
  COMPOSE_DOCUMENT_ROOT_FOLDER_VALUE,
  type ComposeDocumentFolderOption,
} from "@/lib/documents/compose-document-folders.shared";
import { getParentFolderPath } from "@/lib/documents/tree-utils";

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

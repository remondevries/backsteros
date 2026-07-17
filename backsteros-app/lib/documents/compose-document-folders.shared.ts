import { getParentFolderPath } from "@/lib/documents/tree-utils";
import { getSelectedDocumentPathFromPathname } from "@/lib/document-navigation-path";
import { getSelectedKnowledgeDocumentPathFromPathname } from "@/lib/knowledge/navigation-path";

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

export function resolveComposeContextDocumentFolder(pathname: string): string {
  const documentPath =
    getSelectedDocumentPathFromPathname(pathname) ??
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

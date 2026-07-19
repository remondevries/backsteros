type DocumentTreeFolderRenameHandler = (folderPath: string) => boolean;

/** Multiple folders may register; the first that handles the path wins. */
const folderRenameHandlers = new Set<DocumentTreeFolderRenameHandler>();

export function registerDocumentTreeFolderRenameHandler(
  handler: DocumentTreeFolderRenameHandler,
): () => void {
  folderRenameHandlers.add(handler);
  return () => {
    folderRenameHandlers.delete(handler);
  };
}

export function requestDocumentTreeFolderRename(folderPath: string): boolean {
  for (const handler of folderRenameHandlers) {
    if (handler(folderPath)) {
      return true;
    }
  }
  return false;
}

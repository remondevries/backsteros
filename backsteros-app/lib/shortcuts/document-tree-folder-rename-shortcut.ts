type DocumentTreeFolderRenameHandler = (folderPath: string) => boolean;

let folderRenameHandler: DocumentTreeFolderRenameHandler | null = null;

export function registerDocumentTreeFolderRenameHandler(
  handler: DocumentTreeFolderRenameHandler,
): () => void {
  folderRenameHandler = handler;
  return () => {
    if (folderRenameHandler === handler) {
      folderRenameHandler = null;
    }
  };
}

export function requestDocumentTreeFolderRename(folderPath: string): boolean {
  return folderRenameHandler?.(folderPath) ?? false;
}

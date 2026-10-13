type DocumentTreeCreateFolderHandler = () => boolean;

let createFolderHandler: DocumentTreeCreateFolderHandler | null = null;

export function registerDocumentTreeCreateFolderHandler(
  handler: DocumentTreeCreateFolderHandler,
): () => void {
  createFolderHandler = handler;
  return () => {
    if (createFolderHandler === handler) {
      createFolderHandler = null;
    }
  };
}

export function requestDocumentTreeCreateFolder(): boolean {
  return createFolderHandler?.() ?? false;
}

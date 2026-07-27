import type { EntityDeleteConfig } from "./components/entity-actions/entity-header-actions-context.js";

type DocumentTreeDeleteResolver = () => EntityDeleteConfig | null;

let deleteResolver: DocumentTreeDeleteResolver | null = null;

export function registerDocumentTreeDeleteResolver(
  resolver: DocumentTreeDeleteResolver,
): () => void {
  deleteResolver = resolver;
  return () => {
    if (deleteResolver === resolver) {
      deleteResolver = null;
    }
  };
}

export function resolveDocumentTreeDeleteConfig(): EntityDeleteConfig | null {
  return deleteResolver?.() ?? null;
}

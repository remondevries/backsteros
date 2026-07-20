import { DocumentsListPanel } from "./documents-list-panel";

type Props = {
  projectId: string;
};

/** Flat project documents list — desktop `ProjectDocumentsSectionView` parity. */
export function ProjectDocumentsPanel({ projectId }: Props) {
  return (
    <DocumentsListPanel
      documentType="project"
      projectId={projectId}
      emptyMessage="No documents in this project yet."
    />
  );
}

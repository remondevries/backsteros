import {
  DocumentDetailSkeleton,
  MarkdownDocumentDetailView,
  ProjectDocumentsView,
  type KnowledgeListItem,
} from "@backsteros/ui";

import { useCodebaseRepoDocFile } from "../lib/codebase-repo-docs";

function DocsStatus({ message }: { message: string }) {
  return (
    <ProjectDocumentsView>
      <div className="console-pane">
        <div className="console-pane-body">
          <p className="console-github-pane-status">{message}</p>
        </div>
      </div>
    </ProjectDocumentsView>
  );
}

export function CodebaseRepoDocsDetail({
  projectId,
  documentPath,
  items,
  loading,
  error,
  workingDirectoryMissing,
}: {
  projectId: string;
  documentPath: string | null;
  items: KnowledgeListItem[];
  loading: boolean;
  error: string | null;
  workingDirectoryMissing: boolean;
}) {
  const readable = items.filter((item) => item.kind !== "folder");
  const selected =
    documentPath == null
      ? null
      : (readable.find(
          (item) =>
            item.id === documentPath ||
            item.path === documentPath ||
            item.path === decodeURIComponent(documentPath),
        ) ?? null);
  const file = useCodebaseRepoDocFile({
    projectId,
    relativePath: selected?.path ?? selected?.id ?? null,
    enabled: Boolean(selected),
  });

  if (workingDirectoryMissing) {
    return (
      <DocsStatus message="Set a working directory to browse repository docs." />
    );
  }
  if (loading && items.length === 0) {
    return (
      <ProjectDocumentsView>
        <DocumentDetailSkeleton />
      </ProjectDocumentsView>
    );
  }
  if (error && items.length === 0) {
    return <DocsStatus message={error} />;
  }
  if (readable.length === 0) {
    return <DocsStatus message="No docs in this repository." />;
  }
  if (!selected) {
    if (documentPath && !loading) {
      return (
        <DocsStatus message="This file is not in the repository docs." />
      );
    }
    return (
      <ProjectDocumentsView>
        <DocumentDetailSkeleton />
      </ProjectDocumentsView>
    );
  }
  if (file.loading) {
    return (
      <ProjectDocumentsView>
        <DocumentDetailSkeleton />
      </ProjectDocumentsView>
    );
  }
  if (file.error) {
    return <DocsStatus message={file.error} />;
  }

  return (
    <ProjectDocumentsView>
      <MarkdownDocumentDetailView
        sectionLabel="Documents"
        title={selected.title}
        resetKey={selected.id}
        readOnly
        titleEditable={false}
        previewTitleEditable={false}
        initialBody={file.body}
      />
    </ProjectDocumentsView>
  );
}

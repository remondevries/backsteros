import {
  DocumentDetailSkeleton,
  MarkdownDocumentDetailView,
  ProjectDocumentsView,
  TrackedTimeField,
  getScopedProjectDocumentHref,
  type KnowledgeListItem,
  type ProjectRouteScope,
} from "@backsteros/ui";

import { useCodebaseRepoDocFile } from "../lib/codebase-repo-docs";
import { useCodebaseRepoDocTracking } from "../lib/use-codebase-repo-doc-tracking";

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
  projectKey,
  routeScope,
  documentPath,
  items,
  loading,
  error,
  workingDirectoryMissing,
}: {
  projectId: string;
  projectKey: string;
  routeScope: ProjectRouteScope;
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
  const relativePath = selected?.path ?? selected?.id ?? null;
  const file = useCodebaseRepoDocFile({
    projectId,
    relativePath,
    enabled: Boolean(selected),
  });
  const tracking = useCodebaseRepoDocTracking({
    projectId,
    relativePath,
    title: selected?.title ?? "",
    enabled: Boolean(selected) && !workingDirectoryMissing,
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

  const tracked = tracking.trackedDocument;

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
        headerAccessory={
          tracked ? (
            <TrackedTimeField
              variant="pill"
              trackedDurationSeconds={tracked.trackedDurationSeconds ?? null}
              trackedMinutes={tracked.trackedMinutes ?? null}
              onTrackedDurationSecondsChange={(seconds) => {
                void tracking.persistTrackedDuration(seconds);
              }}
              timerSession={{
                kind: "document",
                entityId: tracked.id,
                title: selected.title,
                subtitle: null,
                statusKey: null,
                href: getScopedProjectDocumentHref(
                  projectKey,
                  relativePath ?? tracked.id,
                  routeScope,
                ),
              }}
            />
          ) : null
        }
      />
    </ProjectDocumentsView>
  );
}

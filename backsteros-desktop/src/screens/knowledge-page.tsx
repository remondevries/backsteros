import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  DocumentsEmptyCreateView,
  KnowledgeDetailSkeleton,
  MarkdownDocumentDetailView,
  RegisterEntityDeleteAction,
  RegisterPageTitle,
  getDocumentEditorBody,
  getKnowledgeHref,
  getSelectedKnowledgeDocumentPathFromPathname,
  serializeDocumentBody,
} from "@backsteros/ui";

import { useDesktopDocumentContent } from "../lib/use-document-content";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useDesktopWorkspaceData } from "../lib/workspace-data";

export function KnowledgePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const documentPath =
    getSelectedKnowledgeDocumentPathFromPathname(location.pathname) ?? null;
  const workspace = useDesktopWorkspaceData();
  const [creating, setCreating] = useState(false);

  const knowledgeDocs = workspace.knowledgeDocuments.filter(
    (doc) => doc.kind !== "folder",
  );

  const selected = documentPath
    ? (workspace.knowledgeDocuments.find(
        (doc) =>
          doc.id === documentPath ||
          doc.path === documentPath ||
          doc.path === decodeURIComponent(documentPath),
      ) ?? null)
    : null;

  const { initialBody, onSave, loading } = useDesktopDocumentContent(
    selected?.id ?? null,
  );

  useEffect(() => {
    if (documentPath) return;
    const first = knowledgeDocs[0];
    if (first) {
      navigate(getKnowledgeHref(first.path ?? first.id), { replace: true });
    }
  }, [documentPath, knowledgeDocs, navigate]);

  useDesktopSectionBreadcrumb(
    selected
      ? [
          { label: "Knowledge Base", href: "/knowledge" },
          { label: selected.title },
        ]
      : [{ label: "Knowledge Base" }],
  );

  const handleDeleteDocument = useCallback(async () => {
    if (!selected) {
      return { ok: false as const, error: "Document is required." };
    }
    try {
      await workspace.softDeleteDocument(selected.id);
      navigate("/knowledge", { replace: true });
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete document.",
      };
    }
  }, [navigate, selected, workspace]);

  const handleCreate = useCallback(
    async ({ title, content }: { title: string; content: string }) => {
      if (creating) return;
      setCreating(true);
      try {
        const created = await workspace.createKnowledgeDocument({
          title,
          content,
        });
        navigate(getKnowledgeHref(created.path || created.id));
      } finally {
        setCreating(false);
      }
    },
    [creating, navigate, workspace],
  );

  const editorBody = useMemo(
    () => getDocumentEditorBody(initialBody, selected?.title ?? ""),
    [initialBody, selected?.title],
  );

  if (!documentPath || !selected) {
    if (documentPath) {
      if (!workspace.ready) {
        return <KnowledgeDetailSkeleton />;
      }
      return (
        <div className="inbox-detail-layout">
          <div className="inbox-detail-empty">
            <p>Document not found.</p>
          </div>
        </div>
      );
    }

    if (!workspace.ready || knowledgeDocs.length > 0) {
      return <KnowledgeDetailSkeleton />;
    }

    return (
      <DocumentsEmptyCreateView onCreate={handleCreate} creating={creating} />
    );
  }

  if (loading) {
    return <KnowledgeDetailSkeleton />;
  }

  return (
    <>
      <RegisterPageTitle title={selected.title} />
      <RegisterEntityDeleteAction
        entityLabel={`document "${selected.title}"`}
        onDelete={handleDeleteDocument}
      />
      <MarkdownDocumentDetailView
        sectionLabel="Knowledge"
        title={selected.title}
        resetKey={selected.id}
        initialBody={editorBody}
        onSave={async (nextEditorBody) => {
          await onSave(serializeDocumentBody(nextEditorBody));
        }}
        onSaveTitle={async (title) =>
          workspace.renameDocument(selected.id, title)
        }
      />
    </>
  );
}

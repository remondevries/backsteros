import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  DocumentsEmptyCreateView,
  DocumentDetailIcon,
  KnowledgeDetailSkeleton,
  MarkdownDocumentDetailView,
  RegisterEntityDeleteAction,
  RegisterPageTitle,
  getDocumentEditorBody,
  getKnowledgeHref,
  getSelectedKnowledgeDocumentPathFromPathname,
  serializeDocumentBody,
} from "@backsteros/ui";

import { writeDocumentContentCache } from "../lib/document-content-cache";
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
  const [omittedDocumentIds, setOmittedDocumentIds] = useState<string[]>([]);
  const [pendingEditDocumentId, setPendingEditDocumentId] = useState<
    string | null
  >(null);

  const knowledgeDocs = useMemo(() => {
    const omitted = new Set(omittedDocumentIds);
    return workspace.knowledgeDocuments.filter(
      (doc) => doc.kind !== "folder" && !omitted.has(doc.id),
    );
  }, [omittedDocumentIds, workspace.knowledgeDocuments]);

  const selected = documentPath
    ? (knowledgeDocs.find(
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

  useEffect(() => {
    if (!pendingEditDocumentId || !selected) return;
    if (pendingEditDocumentId !== selected.id) return;
    const frame = requestAnimationFrame(() => {
      setPendingEditDocumentId(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingEditDocumentId, selected]);

  useDesktopSectionBreadcrumb(
    selected
      ? [
          { label: "Knowledge Base", href: "/knowledge" },
          { label: selected.title },
        ]
      : [{ label: "Knowledge Base" }],
  );

  const handleCreate = useCallback(
    async ({ title, content }: { title: string; content: string }) => {
      if (creating) {
        throw new Error("Already creating.");
      }
      setCreating(true);
      try {
        const created = await workspace.createKnowledgeDocument({
          title,
          content,
        });
        writeDocumentContentCache(created.id, {
          content,
          contentVersion: created.contentVersion,
        });
        setPendingEditDocumentId(created.id);
        setOmittedDocumentIds([]);
        navigate(getKnowledgeHref(created.path || created.id), {
          replace: true,
        });
        return created;
      } finally {
        setCreating(false);
      }
    },
    [creating, navigate, workspace],
  );

  const handleDeleteDocument = useCallback(async () => {
    if (!selected) {
      return { ok: false as const, error: "Document is required." };
    }
    const deletedId = selected.id;
    const remaining = knowledgeDocs.filter((doc) => doc.id !== deletedId);
    setOmittedDocumentIds((current) =>
      current.includes(deletedId) ? current : [...current, deletedId],
    );
    try {
      await workspace.softDeleteDocument(deletedId);
      if (remaining.length === 0) {
        navigate("/knowledge", { replace: true });
      } else {
        const next = remaining[0]!;
        navigate(getKnowledgeHref(next.path || next.id), { replace: true });
      }
      return { ok: true as const };
    } catch (error) {
      setOmittedDocumentIds((current) =>
        current.filter((id) => id !== deletedId),
      );
      return {
        ok: false as const,
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete document.",
      };
    }
  }, [knowledgeDocs, navigate, selected, workspace]);

  const editorBody = useMemo(
    () => getDocumentEditorBody(initialBody, selected?.title ?? ""),
    [initialBody, selected?.title],
  );

  const emptyCreate = (
    <DocumentsEmptyCreateView creating={creating} onCreate={handleCreate} />
  );

  if (!documentPath || !selected) {
    if (documentPath) {
      if (!workspace.ready) {
        return <KnowledgeDetailSkeleton />;
      }
      // Stale URL after deleting the last doc → empty create.
      if (knowledgeDocs.length === 0) {
        return emptyCreate;
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

    return emptyCreate;
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
        startInEditMode={pendingEditDocumentId === selected.id}
        icon={
          <DocumentDetailIcon
            documentId={selected.id}
            icon={selected.icon ?? null}
            title={selected.title}
            onSaveIcon={(icon) =>
              workspace.updateDocumentIcon(selected.id, icon)
            }
          />
        }
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

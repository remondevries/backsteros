import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  DocumentsEmptyCreateView,
  DocumentDetailIcon,
  MarkdownDocumentDetailView,
  RegisterEntityDeleteAction,
  RegisterPageTitle,
  getDocumentEditorBody,
  getKnowledgeHref,
  getSelectedKnowledgeDocumentPathFromPathname,
  serializeDocumentBody,
} from "@backsteros/ui";

import { writeDocumentContentCache } from "../lib/document-content-cache";
import {
  useKeepAliveActive,
  useShellLocation,
} from "../lib/shell-route-keep-alive";
import { useDesktopDocumentContent } from "../lib/use-document-content";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import {
  useDesktopWorkspaceActions,
  useDesktopWorkspaceDocuments,
} from "../lib/workspace-data";
import { navigateToHref } from "../router/navigate-href";

export function KnowledgePage() {
  return <KnowledgePageBody />;
}

function KnowledgePageBody() {
  const navigate = useNavigate();
  const location = useShellLocation();
  const keepAliveActive = useKeepAliveActive();
  const sectionLabel = "Knowledge Base";
  const listHref = "/knowledge";
  const getDocHref = getKnowledgeHref;
  const routedDocumentPath =
    getSelectedKnowledgeDocumentPathFromPathname(location.pathname) ?? null;
  const { knowledgeDocuments } = useDesktopWorkspaceDocuments();
  const workspace = useDesktopWorkspaceActions();
  const [creating, setCreating] = useState(false);
  const [omittedDocumentIds, setOmittedDocumentIds] = useState<string[]>([]);
  const [pendingEditDocumentId, setPendingEditDocumentId] = useState<
    string | null
  >(null);

  useEffect(() => {
    void workspace.softRefreshApiDocuments();
  }, [workspace.softRefreshApiDocuments]);

  const knowledgeDocs = useMemo(() => {
    const omitted = new Set(omittedDocumentIds);
    return knowledgeDocuments.filter(
      (doc) => doc.kind !== "folder" && !omitted.has(doc.id));
  }, [knowledgeDocuments, omittedDocumentIds]);

  const firstDoc = knowledgeDocs[0] ?? null;
  const documentPath =
    routedDocumentPath ?? firstDoc?.path ?? firstDoc?.id ?? null;

  const selected =
    (documentPath
      ? (knowledgeDocs.find(
          (doc) =>
            doc.id === documentPath ||
            doc.path === documentPath ||
            doc.path === decodeURIComponent(documentPath)) ?? null)
      : null) ?? firstDoc;

  const { initialBody, onSave } = useDesktopDocumentContent(
    selected?.id ?? null,
    { enabled: keepAliveActive },
  );

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
          { label: sectionLabel, href: listHref },
          { label: selected.title },
        ]
      : [{ label: sectionLabel }],
    { enabled: keepAliveActive });

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
        navigateToHref(navigate, getDocHref(created.path || created.id), {
          replace: true,
        });
        return created;
      } finally {
        setCreating(false);
      }
    },
    [creating, getDocHref, navigate, workspace]);

  const handleDeleteDocument = useCallback(async () => {
    if (!selected) {
      return { ok: false as const, error: "Document is required." };
    }
    const deletedId = selected.id;
    const remaining = knowledgeDocs.filter((doc) => doc.id !== deletedId);
    setOmittedDocumentIds((current) =>
      current.includes(deletedId) ? current : [...current, deletedId]);
    try {
      await workspace.softDeleteDocument(deletedId);
      if (remaining.length === 0) {
        navigateToHref(navigate, listHref, {
          replace: true,
        });
      } else {
        const next = remaining[0]!;
        navigateToHref(navigate, getDocHref(next.path || next.id), {
          replace: true,
        });
      }
      return { ok: true as const };
    } catch (error) {
      setOmittedDocumentIds((current) =>
        current.filter((id) => id !== deletedId));
      return {
        ok: false as const,
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete document.",
      };
    }
  }, [getDocHref, knowledgeDocs, listHref, navigate, selected, workspace]);

  const editorBody = useMemo(
    () => getDocumentEditorBody(initialBody, selected?.title ?? ""),
    [initialBody, selected?.title]);

  const emptyCreate = (
    <DocumentsEmptyCreateView creating={creating} onCreate={handleCreate} />
  );

  if (!selected) {
    if (routedDocumentPath && knowledgeDocs.length > 0) {
      return (
        <div className="inbox-detail-layout">
          <div className="inbox-detail-empty">
            <p>Document not found.</p>
          </div>
        </div>
      );
    }
    return emptyCreate;
  }

  return (
    <>
      {keepAliveActive ? (
        <>
          <RegisterPageTitle
            active={keepAliveActive}
            href={location.pathname}
            title={selected.title}
          />
          <RegisterEntityDeleteAction
            entityLabel={`document "${selected.title}"`}
            onDelete={handleDeleteDocument}
          />
        </>
      ) : null}
      <MarkdownDocumentDetailView
        sectionLabel="Knowledge"
        title={selected.title}
        resetKey={selected.id}
        startInEditMode={pendingEditDocumentId === selected.id}
        shortcutsEnabled={keepAliveActive}
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

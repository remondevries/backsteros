import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import {
  LetterComposeView,
  LetterDetailSkeleton,
  LetterDetailView,
  RegisterEntityDeleteAction,
  RegisterPageTitle,
  buildContactDropdownOptions,
  buildOrganizationDropdownOptions,
  buildProjectDropdownOptions,
  formatLetterDisplayId,
  getLettersHref,
  letterMatchesSlug,
  migrateLegacyTaskStatus,
  type TaskStatus,
} from "@backsteros/ui";

import { LetterPdfPreview } from "../components/letter-pdf-viewer";
import {
  useDesktopAvatarSrcMap,
  withAvatarSrc,
} from "../lib/avatar-src";
import { useDesktopApi } from "../lib/api-context";
import { uploadLetterPdfFile } from "../lib/letter-pdf-upload";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useLetterPdfPanel } from "../lib/use-letter-pdf-panel";
import { useDesktopWorkspaceData } from "../lib/workspace-data";

export type LettersPageProps = {
  letterRouteParam?: string;
  backHref?: string;
  breadcrumbItems?: { label: string; href?: string }[];
  disableAutoSelectFirst?: boolean;
};

export function LettersPage({
  letterRouteParam,
  backHref = "/letters",
  breadcrumbItems,
  disableAutoSelectFirst = false,
}: LettersPageProps = {}) {
  const navigate = useNavigate();
  const { slug: slugParam } = useParams<{ slug?: string }>();
  const [searchParams] = useSearchParams();
  const slug = letterRouteParam ?? slugParam;
  const { client } = useDesktopApi();
  const workspace = useDesktopWorkspaceData();
  const [composePdfUploading, setComposePdfUploading] = useState(false);
  const [statusOverride, setStatusOverride] = useState<TaskStatus | null>(null);
  const [dueDateOverride, setDueDateOverride] = useState<
    Date | null | undefined
  >(undefined);
  const [receivedOverride, setReceivedOverride] = useState<
    Date | null | undefined
  >(undefined);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [projectKey, setProjectKey] = useState<string | null>(null);

  const { letters, organizations, contacts, projects } = workspace;

  const selected = slug
    ? letters.find((letter) => letterMatchesSlug(letter, slug)) ?? null
    : null;

  const record = selected
    ? workspace.letterRecords[selected.id] ?? null
    : null;

  useEffect(() => {
    setStatusOverride(null);
    setDueDateOverride(undefined);
    setReceivedOverride(undefined);
    setOrganizationId(record?.organizationId ?? null);
    setContactId(record?.contactId ?? null);
    const linkedProject = record?.projectId
      ? projects.find((entry) => entry.id === record.projectId)
      : null;
    setProjectKey(linkedProject?.key ?? selected?.projectKey ?? null);
  }, [projects, record, selected?.id, selected?.projectKey]);

  useEffect(() => {
    if (disableAutoSelectFirst || letterRouteParam != null) return;
    if (slug === "new") return;
    if (slug) return;
    const first = letters[0];
    if (first) {
      navigate(getLettersHref(first.number), { replace: true });
    }
  }, [
    disableAutoSelectFirst,
    letterRouteParam,
    letters,
    navigate,
    slug,
  ]);

  const contactAvatarSrc = useDesktopAvatarSrcMap("contact", contacts);
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    organizations,
  );

  const organizationOptions = useMemo(
    () =>
      buildOrganizationDropdownOptions(
        withAvatarSrc(organizations, organizationAvatarSrc),
      ),
    [organizationAvatarSrc, organizations],
  );

  const contactOptions = useMemo(() => {
    const scoped = organizationId
      ? contacts.filter((contact) => contact.organizationId === organizationId)
      : [];
    return buildContactDropdownOptions(
      withAvatarSrc(scoped, contactAvatarSrc),
    );
  }, [contactAvatarSrc, contacts, organizationId]);

  const projectOptions = useMemo(
    () =>
      buildProjectDropdownOptions(
        projects.map((project) => ({
          key: project.key,
          name: project.name,
          icon: project.icon,
        })),
        { includeNone: false },
      ),
    [projects],
  );

  const composeProjectOptions = useMemo(
    () =>
      buildProjectDropdownOptions(
        projects.map((project) => ({
          key: project.key,
          name: project.name,
          icon: project.icon,
        })),
      ),
    [projects],
  );

  const letter = useMemo(() => {
    if (!selected) return null;
    const organization =
      organizations.find((entry) => entry.id === organizationId) ?? null;
    const contact = contacts.find((entry) => entry.id === contactId) ?? null;
    const project =
      projects.find((entry) => entry.key === projectKey) ?? null;
    return {
      id: selected.id,
      title: selected.title,
      status: statusOverride ?? selected.status,
      organizationId,
      organizationName: organization?.name ?? null,
      contactId,
      contactName: contact?.name ?? null,
      receivedDate:
        receivedOverride === undefined
          ? record?.receivedDate
            ? new Date(record.receivedDate).getTime()
            : null
          : receivedOverride
            ? receivedOverride.getTime()
            : null,
      dueDate:
        dueDateOverride === undefined
          ? record?.dueDate
            ? new Date(record.dueDate).getTime()
            : null
          : dueDateOverride
            ? dueDateOverride.getTime()
            : null,
      projectKey: project?.key ?? projectKey,
      projectName: project?.name ?? null,
      body:
        workspace.letterBodies[selected.id] ??
        "",
      displayId: formatLetterDisplayId(selected.number),
    };
  }, [
    contactId,
    contacts,
    dueDateOverride,
    organizationId,
    organizations,
    projectKey,
    projects,
    receivedOverride,
    record,
    selected,
    statusOverride,
    workspace.letterBodies,
  ]);

  const hasLivePdf = Boolean(record?.storageKey && record.byteSize > 0);
  const pdfPanel = useLetterPdfPanel(selected?.id, {
    hasLegacyPdf: hasLivePdf,
    legacyFilename: record?.originalFilename,
    enabled: Boolean(selected && slug !== "new"),
  });

  const breadcrumbTitle =
    slug === "new"
      ? "New"
      : letter
        ? letter.displayId
          ? `${letter.displayId} ${letter.title}`
          : letter.title
        : null;

  useDesktopSectionBreadcrumb(
    breadcrumbItems
      ? [
          ...breadcrumbItems,
          ...(breadcrumbTitle ? [{ label: breadcrumbTitle }] : []),
        ]
      : breadcrumbTitle
        ? [
            { label: "Letters", href: backHref },
            { label: breadcrumbTitle },
          ]
        : [{ label: "Letters", href: backHref }],
  );

  const letterDetailHref = useCallback(
    (created: { id: string; number?: number | null }) => {
      if (created.number != null) {
        if (backHref === "/letters") {
          return getLettersHref(created.number);
        }
        return `${backHref}/${formatLetterDisplayId(created.number).toLowerCase()}`;
      }
      return `${backHref}/${created.id}`;
    },
    [backHref],
  );

  const handleDeleteLetter = useCallback(async () => {
    if (!letter) {
      return { ok: false as const, error: "Letter is required." };
    }
    try {
      await workspace.softDeleteLetter(letter.id);
      navigate(backHref, { replace: true });
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof Error ? error.message : "Failed to delete letter.",
      };
    }
  }, [backHref, letter, navigate, workspace]);

  // Match Next `/letters` index: empty list opens compose instead of a stuck skeleton.
  const showCompose =
    slug === "new" ||
    (!slug &&
      !disableAutoSelectFirst &&
      workspace.ready &&
      letters.length === 0);

  if (showCompose) {
    const composeOrganizationId = searchParams.get("organizationId");
    const composeContactId = searchParams.get("contactId");
    const composeStatusParam = searchParams.get("status");
    const composeStatus = composeStatusParam
      ? migrateLegacyTaskStatus(composeStatusParam)
      : undefined;
    const composeCancelHref =
      backHref !== "/letters"
        ? backHref
        : composeOrganizationId
          ? `/organizations/${
              organizations.find((org) => org.id === composeOrganizationId)
                ?.number ??
              organizations.find((org) => org.id === composeOrganizationId)
                ?.key ??
              composeOrganizationId
            }/letters`
          : "/letters";

    return (
      <LetterComposeView
        initialOrganizationId={composeOrganizationId}
        initialContactId={composeContactId}
        initialStatus={composeStatus}
        organizationOptions={organizationOptions}
        contacts={contacts}
        projectOptions={composeProjectOptions}
        onCreateOrganizationFromQuery={(query) =>
          workspace.createOrganization({ name: query })
        }
        onCreateContactFromQuery={(query, organizationId) =>
          workspace.createContact({
            name: query,
            organizationId,
          })
        }
        onCancel={() => navigate(composeCancelHref)}
        pdfUploading={composePdfUploading}
        onSubmit={(payload) => {
          const project = payload.projectKey
            ? projects.find((entry) => entry.key === payload.projectKey) ?? null
            : null;
          void (async () => {
            const created = await workspace.createLetter({
              title: payload.title,
              body: payload.body,
              status: payload.status,
              organizationId: payload.organizationId,
              contactId: payload.contactId,
              projectId: project?.id ?? null,
              dueDate: payload.dueDate
                ? payload.dueDate.toISOString()
                : null,
              receivedDate: payload.receivedDate
                ? payload.receivedDate.toISOString()
                : null,
            });
            if (payload.pdfFile) {
              setComposePdfUploading(true);
              const upload = await uploadLetterPdfFile(
                client,
                created.id,
                payload.pdfFile,
              );
              setComposePdfUploading(false);
              if (!upload.ok) {
                console.error(upload.error);
                return;
              }
            }
            navigate(letterDetailHref(created));
          })();
        }}
      />
    );
  }

  if (!slug || !letter) {
    if (!slug || !workspace.ready) {
      return <LetterDetailSkeleton />;
    }
    return (
      <div className="inbox-detail-layout">
        <div className="inbox-detail-empty">
          <p>Letter not found.</p>
          <button type="button" onClick={() => navigate(backHref)}>
            Back to letters
          </button>
        </div>
      </div>
    );
  }

  const deleteEntityLabel = letter.displayId
    ? `letter ${letter.displayId}`
    : `letter "${letter.title}"`;

  return (
    <>
      <RegisterPageTitle title={letter.title} />
      <RegisterEntityDeleteAction
        entityLabel={deleteEntityLabel}
        onDelete={handleDeleteLetter}
      />
      <LetterDetailView
        letter={letter}
        showPdfDock
        hasPdfDocument={pdfPanel.hasPdf}
        hasLegacyPdf={hasLivePdf}
        legacyPdfTitle={record?.originalFilename || "Document.pdf"}
        pdfAttachments={pdfPanel.attachments}
        selectedAttachmentId={pdfPanel.selectedAttachmentId}
        onSelectAttachment={pdfPanel.selectAttachment}
        onRenameAttachment={pdfPanel.renameAttachment}
        onAttachmentRenamed={pdfPanel.reloadAttachments}
        onDeleteAttachment={pdfPanel.deleteAttachment}
        pdfOpen={pdfPanel.pdfOpen}
        onTogglePdf={pdfPanel.togglePdfOpen}
        pdfMaximized={pdfPanel.pdfMaximized}
        onTogglePdfMaximize={pdfPanel.togglePdfMaximized}
        pdfUploading={pdfPanel.uploading}
        pdfChildren={
          pdfPanel.hasPdf ? (
            <LetterPdfPreview
              letterId={letter.id}
              attachmentId={pdfPanel.selectedAttachmentId}
              useApi={pdfPanel.hasPdf}
              revision={pdfPanel.revision}
            />
          ) : null
        }
        onUploadPdf={() => {
          void pdfPanel.uploadPdf();
        }}
        onStatusChange={(next) => {
          setStatusOverride(next);
          void workspace.patchLetter(letter.id, { status: next });
        }}
        onDueDateChange={(next) => {
          setDueDateOverride(next);
          void workspace.patchLetter(letter.id, {
            dueDate: next ? next.toISOString() : null,
          });
        }}
        onReceivedDateChange={(next) => {
          setReceivedOverride(next);
          void workspace.patchLetter(letter.id, {
            receivedDate: next ? next.toISOString() : null,
          });
        }}
        onOrganizationChange={(next) => {
          setOrganizationId(next);
          void workspace.patchLetter(letter.id, { organizationId: next });
        }}
        onContactChange={(next) => {
          setContactId(next);
          void workspace.patchLetter(letter.id, { contactId: next });
        }}
        onProjectChange={(next) => {
          setProjectKey(next);
          const project = next
            ? projects.find((entry) => entry.key === next) ?? null
            : null;
          void workspace.patchLetter(letter.id, {
            projectId: project?.id ?? null,
          });
        }}
        onSaveBody={(body) => {
          void workspace.patchLetter(letter.id, { context: body });
        }}
        onSaveTitle={async (title) => {
          const trimmed = title.trim();
          if (!trimmed) {
            return { ok: false as const, error: "Letter title is required." };
          }
          try {
            await workspace.patchLetter(letter.id, { title: trimmed });
            return { ok: true as const };
          } catch (error) {
            return {
              ok: false as const,
              error:
                error instanceof Error
                  ? error.message
                  : "Could not rename letter.",
            };
          }
        }}
        organizationOptions={organizationOptions}
        contactOptions={contactOptions}
        projectOptions={projectOptions}
        organizationNavigateHref={
          organizationId ? `/organizations/${organizationId}` : null
        }
        contactNavigateHref={contactId ? `/contacts/${contactId}` : null}
        projectNavigateHref={projectKey ? `/projects/${projectKey}` : null}
        onCreateOrganizationFromQuery={(query) => {
          void workspace.createOrganization({ name: query }).then((created) => {
            setOrganizationId(created.id);
            void workspace.patchLetter(letter.id, {
              organizationId: created.id,
            });
          });
        }}
        onCreateContactFromQuery={(query) => {
          if (!organizationId) return;
          void workspace
            .createContact({ name: query, organizationId })
            .then((created) => {
              setContactId(created.id);
              void workspace.patchLetter(letter.id, { contactId: created.id });
            });
        }}
      />
    </>
  );
}

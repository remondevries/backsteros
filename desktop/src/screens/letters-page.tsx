import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  LetterComposeView,
  LetterDetailView,
  RegisterEntityDeleteAction,
  RegisterPageTitle,
  buildContactDropdownOptions,
  buildOrganizationDropdownOptions,
  buildProjectDropdownOptions,
  formatLetterDisplayId,
  getLettersHref,
  letterMatchesSlug,
  letterPdfSubjectFromFilename,
  migrateLegacyTaskStatus,
  resolveLetterDetailHref,
  type TaskStatus,
} from "@backsteros/ui";

import { LetterPdfPreview } from "../components/letter-pdf-viewer";
import {
  useDesktopAvatarSrcMap,
  withAvatarSrc,
} from "../lib/avatar-src";
import { useDesktopApi } from "../lib/api-context";
import { uploadLetterPdfFile } from "../lib/letter-pdf-upload";
import { firstLetterSlug } from "../lib/section-entry-hrefs";
import {
  useKeepAliveActive,
  useKeepAliveFrozen,
  useShellLocation,
  useShellParams,
} from "../lib/shell-route-keep-alive";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useLetterPdfPanel } from "../lib/use-letter-pdf-panel";
import {
  useDesktopWorkspaceActions,
  useDesktopWorkspaceMeta,
  useDesktopWorkspacePeople,
  useDesktopWorkspaceProjects,
} from "../lib/workspace-data";
import { navigateToHref } from "../router/navigate-href";

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
  if (letterRouteParam || disableAutoSelectFirst) {
    return (
      <OutletLettersPage
        letterRouteParam={letterRouteParam}
        backHref={backHref}
        breadcrumbItems={breadcrumbItems}
        disableAutoSelectFirst={disableAutoSelectFirst}
      />
    );
  }
  return (
    <LettersPageBody
      letterRouteParam={letterRouteParam}
      backHref={backHref}
      breadcrumbItems={breadcrumbItems}
      disableAutoSelectFirst={disableAutoSelectFirst}
    />
  );
}

function OutletLettersPage(props: LettersPageProps) {
  const { pathname } = useShellLocation();
  const onLettersRoute =
    pathname === "/letters" ||
    pathname.startsWith("/letters/") ||
    pathname === "/letters-v2" ||
    pathname.startsWith("/letters-v2/") ||
    /\/letters(\/|$)/.test(pathname);
  if (!onLettersRoute && !props.disableAutoSelectFirst) return null;
  return <LettersPageBody {...props} />;
}

function LettersPageBody({
  letterRouteParam,
  backHref = "/letters",
  breadcrumbItems,
  disableAutoSelectFirst = false,
}: LettersPageProps = {}) {
  const routerNavigate = useNavigate();
  const navigate = useCallback(
    (
      to: string,
      options?: { replace?: boolean; state?: unknown },
    ) => {
      navigateToHref(routerNavigate, to, options);
    },
    [routerNavigate]);
  const keepAliveActive = useKeepAliveActive();
  const keepAliveFrozen = useKeepAliveFrozen();
  const { slug: slugParam } = useShellParams() as { slug?: string };
  const { pathname, searchStr } = useShellLocation();
  const searchParams = useMemo(
    () =>
      new URLSearchParams(
        searchStr.startsWith("?") ? searchStr.slice(1) : searchStr),
    [searchStr]);
  const routedSlug = letterRouteParam ?? slugParam;
  const { client } = useDesktopApi();
  const { ready } = useDesktopWorkspaceMeta();
  const {
    letters: workspaceLetters,
    letterRecords,
    letterBodies,
    projects,
  } = useDesktopWorkspaceProjects();
  const { organizations, contacts } = useDesktopWorkspacePeople();
  const workspace = useDesktopWorkspaceActions();
  const [composePdfUploading, setComposePdfUploading] = useState(false);
  const [omittedLetterIds, setOmittedLetterIds] = useState<string[]>([]);
  const [statusOverride, setStatusOverride] = useState<TaskStatus | null>(null);
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const [dueDateOverride, setDueDateOverride] = useState<
    Date | null | undefined
  >(undefined);
  const [receivedOverride, setReceivedOverride] = useState<
    Date | null | undefined
  >(undefined);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [projectKey, setProjectKey] = useState<string | null>(null);

  const letters = useMemo(
    () =>
      workspaceLetters.filter(
        (letter) => !omittedLetterIds.includes(letter.id)),
    [omittedLetterIds, workspaceLetters]);
  const slug =
    routedSlug ??
    (disableAutoSelectFirst
      ? undefined
      : firstLetterSlug(letters) ?? letters[0]?.id ?? undefined);

  useEffect(() => {
    if (omittedLetterIds.length === 0) return;
    const present = new Set(workspaceLetters.map((letter) => letter.id));
    setOmittedLetterIds((current) => {
      const next = current.filter((id) => present.has(id));
      return next.length === current.length ? current : next;
    });
  }, [omittedLetterIds.length, workspaceLetters]);

  const selected = slug
    ? letters.find((letter) => letterMatchesSlug(letter, slug)) ?? null
    : null;

  const record = selected
    ? letterRecords[selected.id] ?? null
    : null;

  useEffect(() => {
    setStatusOverride(null);
    setTitleOverride(null);
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
    if (titleOverride == null || !selected) return;
    if (selected.title === titleOverride) {
      setTitleOverride(null);
    }
  }, [selected, titleOverride]);

  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    keepAliveFrozen ? [] : contacts);
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    keepAliveFrozen ? [] : organizations);

  const organizationOptions = useMemo(
    () =>
      buildOrganizationDropdownOptions(
        withAvatarSrc(organizations, organizationAvatarSrc)),
    [organizationAvatarSrc, organizations]);

  const contactOptions = useMemo(() => {
    const scoped = organizationId
      ? contacts.filter((contact) => contact.organizationId === organizationId)
      : [];
    return buildContactDropdownOptions(
      withAvatarSrc(scoped, contactAvatarSrc));
  }, [contactAvatarSrc, contacts, organizationId]);

  const projectOptions = useMemo(
    () =>
      buildProjectDropdownOptions(
        projects.map((project) => ({
          key: project.key,
          name: project.name,
          icon: project.icon,
          type: project.type,
        })),
        { includeNone: false }),
    [projects]);

  const composeProjectOptions = useMemo(
    () =>
      buildProjectDropdownOptions(
        projects.map((project) => ({
          key: project.key,
          name: project.name,
          icon: project.icon,
          type: project.type,
        }))),
    [projects]);

  const letter = useMemo(() => {
    if (!selected) return null;
    const organization =
      organizations.find((entry) => entry.id === organizationId) ?? null;
    const contact = contacts.find((entry) => entry.id === contactId) ?? null;
    const project =
      projects.find((entry) => entry.key === projectKey) ?? null;
    return {
      id: selected.id,
      title: titleOverride ?? selected.title,
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
        letterBodies[selected.id] ??
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
    titleOverride,
    letterBodies,
  ]);

  const hasLivePdf = Boolean(record?.storageKey && record.byteSize > 0);
  const pdfPanel = useLetterPdfPanel(selected?.id, {
    hasLegacyPdf: hasLivePdf,
    legacyFilename: record?.originalFilename,
    enabled: keepAliveActive && Boolean(selected && slug !== "new"),
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
    { enabled: keepAliveActive });

  const letterDetailHref = useCallback(
    (created: { id: string; number?: number | null }) =>
      resolveLetterDetailHref({
        id: created.id,
        number: created.number,
        listBaseHref: backHref,
      }),
    [backHref],
  );

  const handleDeleteLetter = useCallback(async () => {
    if (!letter) {
      return { ok: false as const, error: "Letter is required." };
    }
    const deletedId = letter.id;
    const remaining = letters.filter((entry) => entry.id !== deletedId);
    setOmittedLetterIds((current) =>
      current.includes(deletedId) ? current : [...current, deletedId]);
    try {
      await workspace.softDeleteLetter(deletedId);
      if (remaining.length === 0) {
        navigate(backHref, { replace: true });
      } else {
        navigate(letterDetailHref(remaining[0]!), { replace: true });
      }
      return { ok: true as const };
    } catch (error) {
      setOmittedLetterIds((current) =>
        current.filter((id) => id !== deletedId));
      return {
        ok: false as const,
        error:
          error instanceof Error ? error.message : "Failed to delete letter.",
      };
    }
  }, [backHref, letter, letterDetailHref, letters, navigate, workspace]);

  // Match Next `/letters` index: empty list opens compose instead of a stuck skeleton.
  const showCompose =
    slug === "new" ||
    (!slug &&
      !disableAutoSelectFirst &&
      ready &&
      letters.length === 0);

  if (showCompose) {
    const composeOrganizationId = searchParams.get("organizationId");
    const composeContactId = searchParams.get("contactId");
    const composeStatusParam = searchParams.get("status");
    const composeStatus = composeStatusParam
      ? migrateLegacyTaskStatus(composeStatusParam)
      : undefined;

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
        pdfUploading={composePdfUploading}
        onSubmit={(payload) => {
          const project = payload.projectKey
            ? projects.find((entry) => entry.key === payload.projectKey) ?? null
            : null;
          void (async () => {
            try {
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
              setOmittedLetterIds([]);
              const shouldNavigate = payload.navigateAfterCreate !== false;
              if (shouldNavigate) {
                // Navigate immediately so the letter is selectable in the side
                // list; upload the PDF afterward (failure must not drop the letter).
                navigate(letterDetailHref(created), { replace: true });
              }
              if (payload.pdfFile) {
                setComposePdfUploading(true);
                const upload = await uploadLetterPdfFile(
                  client,
                  created.id,
                  payload.pdfFile);
                setComposePdfUploading(false);
                if (!upload.ok) {
                  console.error(upload.error);
                }
              }
            } catch (error) {
              console.error("[desktop] create letter", error);
            }
          })();
        }}
      />
    );
  }

  if (!slug || !letter) {
    return (
      <div className="inbox-detail-layout">
        <div className="inbox-detail-empty">
          {slug ? (
            <>
              <p>Letter not found.</p>
              <button type="button" onClick={() => navigate(backHref)}>
                Back to letters
              </button>
            </>
          ) : (
            <p>No letters yet.</p>
          )}
        </div>
      </div>
    );
  }

  const deleteEntityLabel = letter.displayId
    ? `letter ${letter.displayId}`
    : `letter "${letter.title}"`;

  return (
    <>
      {keepAliveActive ? (
        <>
          <RegisterPageTitle
            active={keepAliveActive}
            href={pathname}
            title={letter.title}
          />
          <RegisterEntityDeleteAction
            entityLabel={deleteEntityLabel}
            onDelete={handleDeleteLetter}
          />
        </>
      ) : null}
      <LetterDetailView
        letter={letter}
        shortcutsEnabled={keepAliveActive}
        showPdfDock
        hasPdfDocument={pdfPanel.hasPdf}
        hasLegacyPdf={hasLivePdf}
        legacyPdfTitle={record?.originalFilename || "Document.pdf"}
        pdfAttachments={pdfPanel.attachments}
        selectedAttachmentId={pdfPanel.selectedAttachmentId}
        onSelectAttachment={pdfPanel.selectAttachment}
        onRenameAttachment={async (attachmentId, originalFilename) => {
          const result = await pdfPanel.renameAttachment(
            attachmentId,
            originalFilename,
          );
          if (result.ok) {
            const primaryId = pdfPanel.attachments[0]?.id;
            if (attachmentId === primaryId) {
              setTitleOverride(
                letterPdfSubjectFromFilename(originalFilename),
              );
            }
          }
          return result;
        }}
        onAttachmentRenamed={pdfPanel.reloadAttachments}
        onDeleteAttachment={pdfPanel.deleteAttachment}
        onReorderAttachments={async (orderedIds) => {
          const result = await pdfPanel.reorderAttachments(orderedIds);
          if (!result.ok) {
            window.alert(
              `Could not save PDF order.\n${result.error}\n\nIf you are on Prod, switch Settings → Backend to Dev (local API), or deploy the API with the reorder route.`);
          }
        }}
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
        onUploadPdfFile={(file) => {
          void pdfPanel.uploadPdfFile(file);
        }}
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
            // Primary PDF label follows title on the server — refresh tabs.
            void pdfPanel.reloadAttachments();
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

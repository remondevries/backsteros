import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  DocumentsEmptyCreateView,
  DocumentDetailIcon,
  DROPDOWN_NONE_VALUE,
  HelpArticleDetailView,
  MarkdownDocumentDetailView,
  RegisterEntityDeleteAction,
  RegisterPageTitle,
  SpacesOverviewView,
  SpaceSettingsSidePanel,
  DEFAULT_SUPPORT_SPACE_SETTINGS,
  DEFAULT_SPACE_SEO_ENTITY,
  spaceSeoEntityFromPayload,
  spaceSeoEntityToPayload,
  ResizableSidePanel,
  SPACE_SETTINGS_PANEL_WIDTH_KEY,
  buildAssigneeDropdownOptions,
  createDefaultHelpArticleProperties,
  filterDocumentsForHelpArticleScope,
  filterDocumentsForSpaceRoot,
  findHelpArticleIndividualRoot,
  formatFolderDeleteConfirmLabel,
  getDocumentEditorBody,
  getKnowledgeHref,
  getSelectedKnowledgeDocumentPathFromPathname,
  getSelectedSpaceRootFromPathname,
  HELP_ARTICLE_AUDIENCE_GROUP,
  HELP_ARTICLE_AUDIENCE_INDIVIDUAL,
  isSpacesOverviewPath,
  isSupportCenterDocumentPath,
  isWebsiteDocumentPath,
  normalizeSpacesDocumentPath,
  resolveSpacesCategoryId,
  SPACES_CATEGORIES,
  findDuplicateSpaceOverviewIdsToDelete,
  findLocalOnlySpacesToPublish,
  listHelpArticleMoveFolders,
  listHelpArticlePlacementFolders,
  normalizeHelpArticleProperties,
  resolveHelpArticleAudience,
  resolveHelpArticleFolderId,
  resolveHelpArticleSlugPrefix,
  rewriteHelpArticleSlugPrefix,
  serializeDocumentBody,
  serializeSpacesDocumentBody,
  useEntityHeaderActionsContext,
  useHelpArticleAudienceMap,
  useHelpArticleListScope,
  useWriteHelpArticleAudience,
  type HelpArticleProperties,
  type HelpArticleSeoDetails,
  type HelpArticleStatus,
  type KnowledgeListItem,
  type SpaceOverviewCardItem,
  type SpaceSeoEntitySettings,
  type SpaceSiteKeyInfo,
  type SupportSpaceSettings,
} from "@backsteros/ui";

import {
  useDesktopAvatarSrcMap,
  withAvatarSrc,
} from "../lib/avatar-src";
import {
  clearDesktopSpaceCoverPreview,
  rememberDesktopSpaceCover,
  rememberDesktopSpaceCoverPreview,
  useDesktopSpaceCoverSrcMap,
} from "../lib/space-cover-src";
import { writeDocumentContentCache } from "../lib/document-content-cache";
import { useDesktopApi } from "../lib/api-context";
import {
  useKeepAliveActive,
  useShellLocation,
} from "../lib/shell-route-keep-alive";
import { useDesktopDocumentContent } from "../lib/use-document-content";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import {
  useDesktopWorkspaceActions,
  useDesktopWorkspaceDocuments,
  useDesktopWorkspacePeople,
  useWorkspaceSurfaceReady,
} from "../lib/workspace-data";
import { navigateToHref } from "../router/navigate-href";

/** Spaces overview reconcile is once per app session (not every visit). */
let spacesOverviewReconcileDone = false;
/** One-shot REST rescue when local SQLite lacks Spaces category roots. */
let spacesCategoryRootsRescueDone = false;

type SpacePublishSettingsResponse = {
  publicBaseUrl: string | null;
  allowedDomains: string[];
  siteKeys?: SpaceSiteKeyInfo[];
  siteKeyPresent?: boolean;
  seoMeta?: Parameters<typeof spaceSeoEntityFromPayload>[0];
};

function mapSupportSpaceSettings(
  settings: SpacePublishSettingsResponse,
): SupportSpaceSettings {
  return {
    publicBaseUrl: settings.publicBaseUrl ?? "",
    allowedDomains: (settings.allowedDomains ?? []).join("\n"),
    siteKeys: settings.siteKeys ?? [],
  };
}

export function KnowledgePage() {
  return <KnowledgePageBody />;
}

function KnowledgePageBody() {
  const navigate = useNavigate();
  const location = useShellLocation();
  const keepAliveActive = useKeepAliveActive();
  const sectionLabel = "Spaces";
  const listHref = "/spaces";
  const getDocHref = getKnowledgeHref;
  const routedDocumentPath =
    getSelectedKnowledgeDocumentPathFromPathname(location.pathname) ?? null;
  const { knowledgeDocuments } = useDesktopWorkspaceDocuments();
  const knowledgeReady = useWorkspaceSurfaceReady("knowledge");
  const { contacts } = useDesktopWorkspacePeople();
  const workspace = useDesktopWorkspaceActions();
  const contactAvatarSrc = useDesktopAvatarSrcMap("contact", contacts);
  const spaceCoverSrc = useDesktopSpaceCoverSrcMap(knowledgeDocuments);
  const [creating, setCreating] = useState(false);
  const [omittedDocumentIds, setOmittedDocumentIds] = useState<string[]>([]);
  const [pendingEditDocumentId, setPendingEditDocumentId] = useState<
    string | null
  >(null);
  /** Optimistic publish props until PowerSync catches up. */
  const [helpArticlePropsById, setHelpArticlePropsById] = useState<
    Record<string, HelpArticleProperties>
  >({});
  const [supportSettingsById, setSupportSettingsById] = useState<
    Record<string, SupportSpaceSettings>
  >({});
  const [seoEntityById, setSeoEntityById] = useState<
    Record<string, SpaceSeoEntitySettings>
  >({});
  const [settingsSpace, setSettingsSpace] =
    useState<SpaceOverviewCardItem | null>(null);
  const settingsSpaceSeo = useMemo(() => {
    if (!settingsSpace) return null;
    const doc = knowledgeDocuments.find((d) => d.id === settingsSpace.id);
    return {
      publishSlug: doc?.publishSlug ?? "",
      seoTitle: doc?.seoTitle ?? "",
      seoDescription: doc?.seoDescription ?? "",
    };
  }, [knowledgeDocuments, settingsSpace]);
  const settingsSpaceSeoEntity = useMemo(
    () =>
      settingsSpace
        ? (seoEntityById[settingsSpace.id] ?? DEFAULT_SPACE_SEO_ENTITY)
        : DEFAULT_SPACE_SEO_ENTITY,
    [seoEntityById, settingsSpace],
  );
  const [listScope] = useHelpArticleListScope();
  const audienceById = useHelpArticleAudienceMap();
  const writeArticleAudience = useWriteHelpArticleAudience();
  const { openDeleteModal } = useEntityHeaderActionsContext();
  const { client } = useDesktopApi();

  const onOverview = isSpacesOverviewPath(location.pathname);

  // Local PowerSync can be "ready" with knowledge rows but still miss the
  // Spaces category roots (pre-heal paths). REST cold-start hydrate is skipped
  // once SQLite has any rows, so force a knowledge list pull once.
  useEffect(() => {
    if (!onOverview || !knowledgeReady) return;
    if (spacesCategoryRootsRescueDone) return;
    const hasCategoryRoot = SPACES_CATEGORIES.some((category) =>
      knowledgeDocuments.some(
        (doc) =>
          doc.kind === "folder" &&
          normalizeSpacesDocumentPath(doc.path) === category.rootPath,
      ),
    );
    if (hasCategoryRoot) {
      spacesCategoryRootsRescueDone = true;
      return;
    }
    spacesCategoryRootsRescueDone = true;
    void workspace
      .softRefreshApiDocuments({ force: true, type: "knowledge" })
      .catch(() => {
        spacesCategoryRootsRescueDone = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per session when overview lacks roots
  }, [onOverview, knowledgeReady, knowledgeDocuments]);

  // Publish local-only overview cards to the API and soft-delete duplicate
  // local ghosts (e.g. a second "Portal") so agents see the same Spaces board.
  // Once per app session — not on every overview visit (Tasks-shaped: no
  // REST tax when opening a section that already has local metadata).
  useEffect(() => {
    if (!onOverview) return;
    if (spacesOverviewReconcileDone) return;
    spacesOverviewReconcileDone = true;
    let cancelled = false;
    void (async () => {
      try {
        const remote = await client.requestJson<{
          documents: Array<{
            id: string;
            title: string;
            path: string | null;
            kind: string;
            parentId: string | null;
            icon?: string | null;
            updatedAt?: string | number | null;
          }>;
        }>("/api/v1/documents?type=knowledge");
        if (cancelled) return;
        const apiDocs = (remote.documents ?? []).map((doc) => ({
          id: doc.id,
          title: doc.title,
          path: doc.path,
          kind: doc.kind === "folder" ? ("folder" as const) : ("document" as const),
          parentId: doc.parentId,
          icon: doc.icon ?? null,
          updatedAt:
            typeof doc.updatedAt === "string"
              ? Date.parse(doc.updatedAt)
              : (doc.updatedAt ?? null),
        }));

        const toPublish = findLocalOnlySpacesToPublish(
          knowledgeDocuments,
          apiDocs,
        );
        for (const space of toPublish) {
          if (cancelled) return;
          await workspace.createKnowledgeFolder({
            title: space.title,
            parentId: space.parentFolderId,
            parentPath: space.categoryRootPath,
            icon: space.icon,
            path: space.path,
          });
        }

        // Refresh API ids after publishes so we don't delete the new server rows.
        const remoteAfter =
          toPublish.length > 0
            ? await client.requestJson<{
                documents: Array<{ id: string }>;
              }>("/api/v1/documents?type=knowledge")
            : remote;
        if (cancelled) return;
        const apiIds = new Set(
          (remoteAfter.documents ?? []).map((doc) => doc.id),
        );

        const deleteIds = findDuplicateSpaceOverviewIdsToDelete(
          knowledgeDocuments,
        );
        const extraDeletes: string[] = [];
        for (const space of toPublish) {
          for (const doc of knowledgeDocuments) {
            if (doc.kind !== "folder") continue;
            if (doc.parentId !== space.parentFolderId) continue;
            if (
              doc.title.trim().toLowerCase() !==
              space.title.trim().toLowerCase()
            ) {
              continue;
            }
            if (!apiIds.has(doc.id)) extraDeletes.push(doc.id);
          }
        }
        // Also delete local-only duplicate titles when API already had the card
        // (e.g. second Portal ghost after heal).
        for (const categoryRoot of [
          "knowledge-base",
          "support",
          "websites",
        ] as const) {
          const apiTitles = new Set(
            apiDocs
              .filter((doc) => {
                const parent = apiDocs.find((p) => p.id === doc.parentId);
                return (
                  doc.kind === "folder" &&
                  parent?.path === categoryRoot
                );
              })
              .map((doc) => doc.title.trim().toLowerCase()),
          );
          for (const doc of knowledgeDocuments) {
            if (doc.kind !== "folder") continue;
            const parent = knowledgeDocuments.find((p) => p.id === doc.parentId);
            if (parent?.path !== categoryRoot) continue;
            if (!apiTitles.has(doc.title.trim().toLowerCase())) continue;
            if (apiIds.has(doc.id)) continue;
            extraDeletes.push(doc.id);
          }
        }

        const allDeletes = [...new Set([...deleteIds, ...extraDeletes])];
        for (const id of allDeletes) {
          if (cancelled) return;
          if (apiIds.has(id)) continue;
          await workspace.deleteDocument(id);
        }

        if ((toPublish.length > 0 || allDeletes.length > 0) && !cancelled) {
          await workspace.softRefreshApiDocuments();
        }
      } catch (error) {
        console.warn("[desktop] spaces overview reconcile failed", error);
        // Allow a retry next overview visit if this session failed.
        spacesOverviewReconcileDone = false;
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per session when opening overview
  }, [onOverview]);

  const spaceRoot = useMemo(
    () =>
      getSelectedSpaceRootFromPathname(location.pathname, knowledgeDocuments),
    [knowledgeDocuments, location.pathname],
  );

  const spaceCategoryId = useMemo(
    () => resolveSpacesCategoryId(spaceRoot, knowledgeDocuments),
    [knowledgeDocuments, spaceRoot],
  );
  const isSupportSpace =
    spaceCategoryId === "support" ||
    isSupportCenterDocumentPath(spaceRoot?.path);
  const isWebsiteSpace =
    spaceCategoryId === "websites" ||
    isWebsiteDocumentPath(spaceRoot?.path);
  // All drilled-in spaces share the same properties rail; Support alone
  // adds Group / Individual. KB + Websites stay a single flat tree.
  const isPublishableSpace = Boolean(spaceRoot);

  const scopedDocuments = useMemo(() => {
    if (!spaceRoot) return [] as KnowledgeListItem[];
    return filterDocumentsForSpaceRoot(knowledgeDocuments, spaceRoot.id);
  }, [knowledgeDocuments, spaceRoot]);

  const scopedForList = useMemo(() => {
    if (!isSupportSpace) return scopedDocuments;
    return filterDocumentsForHelpArticleScope(
      scopedDocuments,
      listScope,
      audienceById,
    );
  }, [audienceById, isSupportSpace, listScope, scopedDocuments]);

  const knowledgeDocs = useMemo(() => {
    const omitted = new Set(omittedDocumentIds);
    return scopedForList.filter(
      (doc) => doc.kind !== "folder" && !omitted.has(doc.id),
    );
  }, [omittedDocumentIds, scopedForList]);

  const routedIsFolder =
    Boolean(routedDocumentPath) &&
    (routedDocumentPath === spaceRoot?.path ||
      routedDocumentPath === spaceRoot?.id ||
      scopedDocuments.some(
        (doc) =>
          doc.kind === "folder" &&
          (doc.path === routedDocumentPath || doc.id === routedDocumentPath),
      ));

  const firstDoc = knowledgeDocs[0] ?? null;
  // Classic KB: when landing on a space/folder route, open the first document.
  const documentPath =
    onOverview || routedIsFolder
      ? (firstDoc?.path ?? firstDoc?.id ?? null)
      : (routedDocumentPath ?? firstDoc?.path ?? firstDoc?.id ?? null);

  const selected =
    documentPath == null
      ? null
      : (knowledgeDocs.find(
          (doc) =>
            doc.id === documentPath ||
            doc.path === documentPath ||
            doc.path === decodeURIComponent(documentPath),
        ) ?? firstDoc);

  const { initialBody, onSave } = useDesktopDocumentContent(
    selected?.id ?? null,
    { enabled: keepAliveActive && !onOverview },
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
    onOverview
      ? [{ label: sectionLabel }]
      : selected
        ? [
            { label: sectionLabel, href: listHref },
            ...(spaceRoot
              ? [
                  {
                    label: spaceRoot.title,
                    href: getDocHref(spaceRoot.path ?? spaceRoot.id),
                  },
                ]
              : []),
            { label: selected.title },
          ]
        : spaceRoot
          ? [
              { label: sectionLabel, href: listHref },
              { label: spaceRoot.title },
            ]
          : [{ label: sectionLabel }],
    { enabled: keepAliveActive },
  );

  const handleCreateSpaceFolder = useCallback(
    async (input: {
      categoryId: string;
      title: string;
      parentFolderId: string;
      icon?: string;
    }) => {
      const parent = knowledgeDocuments.find(
        (doc) => doc.id === input.parentFolderId,
      );
      return workspace.createKnowledgeFolder({
        title: input.title,
        parentId: input.parentFolderId,
        parentPath: parent?.path ?? null,
        icon: input.icon ?? null,
      });
    },
    [knowledgeDocuments, workspace],
  );

  const handleReorderSpace = useCallback(
    (orderedIds: string[]) => {
      void workspace.reorderDocuments(orderedIds);
    },
    [workspace],
  );

  const requestDeleteSpace = useCallback(
    (item: SpaceOverviewCardItem) => {
      const nestedCount = knowledgeDocuments.filter(
        (doc) =>
          doc.id !== item.id &&
          (doc.parentId === item.id ||
            (doc.path ?? "").startsWith(`${item.path ?? ""}/`)),
      ).length;
      openDeleteModal({
        entityLabel: `"${item.title}"`,
        confirmLabel: formatFolderDeleteConfirmLabel(nestedCount),
        onDelete: async () => {
          const result = await workspace.deleteDocument(item.id);
          if (!result.ok) return result;
          setSupportSettingsById((current) => {
            if (!(item.id in current)) return current;
            const next = { ...current };
            delete next[item.id];
            return next;
          });
          setSettingsSpace((current) =>
            current?.id === item.id ? null : current,
          );
          return { ok: true as const };
        },
      });
    },
    [knowledgeDocuments, openDeleteModal, workspace],
  );

  const individualRoot = useMemo(
    () =>
      isSupportSpace
        ? findHelpArticleIndividualRoot(scopedDocuments)
        : null,
    [isSupportSpace, scopedDocuments],
  );

  const handleCreate = useCallback(
    async ({ title, content }: { title: string; content: string }) => {
      if (creating) {
        throw new Error("Already creating.");
      }
      setCreating(true);
      try {
        const underIndividual =
          isSupportSpace &&
          listScope === HELP_ARTICLE_AUDIENCE_INDIVIDUAL &&
          individualRoot;
        const created = await workspace.createKnowledgeDocument({
          title,
          content,
          parentId: underIndividual
            ? individualRoot.id
            : (spaceRoot?.id ?? null),
          folderPath: underIndividual
            ? (individualRoot.path ?? undefined)
            : (spaceRoot?.path ?? undefined),
        });
        writeDocumentContentCache(created.id, {
          content,
          contentVersion: created.contentVersion,
        });
        if (isSupportSpace) {
          writeArticleAudience(created.id, listScope);
        }
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
    [
      creating,
      getDocHref,
      individualRoot,
      isSupportSpace,
      listScope,
      navigate,
      spaceRoot,
      workspace,
      writeArticleAudience,
    ],
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
        navigateToHref(
          navigate,
          spaceRoot ? getDocHref(spaceRoot.path ?? spaceRoot.id) : listHref,
          { replace: true },
        );
      } else {
        const next = remaining[0]!;
        navigateToHref(navigate, getDocHref(next.path || next.id), {
          replace: true,
        });
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
  }, [
    getDocHref,
    knowledgeDocs,
    listHref,
    navigate,
    selected,
    spaceRoot,
    workspace,
  ]);

  const editorBody = useMemo(
    () => getDocumentEditorBody(initialBody, selected?.title ?? ""),
    [initialBody, selected?.title],
  );

  const isPublishableArticle = Boolean(selected && isPublishableSpace);

  const helpArticle = useMemo(() => {
    if (!selected || !isPublishableArticle) return null;
    const audience = isSupportSpace
      ? (selected.audience === "individual"
          ? HELP_ARTICLE_AUDIENCE_INDIVIDUAL
          : resolveHelpArticleAudience(selected.id, audienceById))
      : HELP_ARTICLE_AUDIENCE_GROUP;
    const stored = helpArticlePropsById[selected.id];
    return normalizeHelpArticleProperties({
      ...(stored ??
        createDefaultHelpArticleProperties(selected.id, audience)),
      id: selected.id,
      audience,
      status:
        stored?.status ??
        (selected.publishStatus === "published" ||
        selected.publishStatus === "offline" ||
        selected.publishStatus === "concept"
          ? selected.publishStatus
          : undefined),
      slug: stored?.slug ?? selected.publishSlug ?? undefined,
      seoTitle: stored?.seoTitle ?? selected.seoTitle ?? undefined,
      seoDescription:
        stored?.seoDescription ?? selected.seoDescription ?? undefined,
      contactIds: stored?.contactIds ?? selected.contactIds ?? undefined,
      placementFolderId:
        stored?.placementFolderId ?? selected.placementFolderId ?? undefined,
    });
  }, [
    audienceById,
    helpArticlePropsById,
    isPublishableArticle,
    isSupportSpace,
    selected,
  ]);

  const contactOptions = useMemo(
    () =>
      buildAssigneeDropdownOptions(
        withAvatarSrc(contacts, contactAvatarSrc),
      ),
    [contactAvatarSrc, contacts],
  );

  const placementOptions = useMemo(() => {
    if (!isSupportSpace) return [];
    const folders = listHelpArticlePlacementFolders(
      scopedDocuments,
      audienceById,
    );
    return [
      {
        value: DROPDOWN_NONE_VALUE,
        label: "No section",
        searchTerms: "none unassigned",
      },
      ...folders.map((folder) => ({
        value: folder.id,
        label: folder.title,
        searchTerms: `${folder.title} ${folder.path}`,
      })),
    ];
  }, [audienceById, isSupportSpace, scopedDocuments]);

  const folderOptions = useMemo(() => {
    if (
      !isPublishableSpace ||
      !helpArticle ||
      helpArticle.audience === HELP_ARTICLE_AUDIENCE_INDIVIDUAL
    ) {
      return [];
    }
    const folders = listHelpArticleMoveFolders(
      scopedDocuments,
      helpArticle.audience,
      spaceRoot?.id ?? null,
    );
    return [
      {
        value: DROPDOWN_NONE_VALUE,
        label: "No folder",
        searchTerms: "none root unassigned",
      },
      ...folders.map((folder) => ({
        value: folder.id,
        label: folder.title,
        searchTerms: `${folder.title} ${folder.path}`,
      })),
    ];
  }, [helpArticle, isPublishableSpace, scopedDocuments, spaceRoot?.id]);

  const selectedFolderId = useMemo(() => {
    if (!selected || !helpArticle) return null;
    return resolveHelpArticleFolderId(selected, {
      audience: helpArticle.audience,
      spaceRootId: spaceRoot?.id ?? null,
      individualRootId: individualRoot?.id ?? null,
    });
  }, [helpArticle, individualRoot?.id, selected, spaceRoot?.id]);

  const slugPrefix = useMemo(() => {
    if (!selectedFolderId) return "";
    const folder = scopedDocuments.find(
      (doc) => doc.kind === "folder" && doc.id === selectedFolderId,
    );
    return resolveHelpArticleSlugPrefix({
      folderPath: folder?.path ?? null,
      spaceRootPath: spaceRoot?.path ?? null,
    });
  }, [scopedDocuments, selectedFolderId, spaceRoot?.path]);

  const showSeoDetails = Boolean(
    spaceRoot &&
      (supportSettingsById[spaceRoot.id] ?? DEFAULT_SUPPORT_SPACE_SETTINGS)
        .siteKeys.length > 0,
  );

  useEffect(() => {
    if (!spaceRoot) return;
    let cancelled = false;
    void (async () => {
      try {
        const settings = await client.requestJson<SpacePublishSettingsResponse>(
          `/api/v1/spaces/${encodeURIComponent(spaceRoot.id)}/publish-settings`,
        );
        if (cancelled) return;
        setSupportSettingsById((current) => ({
          ...current,
          [spaceRoot.id]: mapSupportSpaceSettings(settings),
        }));
        setSeoEntityById((current) => ({
          ...current,
          [spaceRoot.id]: spaceSeoEntityFromPayload(settings.seoMeta),
        }));
      } catch {
        // Offline / not migrated yet — keep local defaults.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, spaceRoot]);

  const handleOpenSpaceSettings = useCallback((item: SpaceOverviewCardItem) => {
    setSettingsSpace(item);
    void (async () => {
      try {
        const settings = await client.requestJson<SpacePublishSettingsResponse>(
          `/api/v1/spaces/${encodeURIComponent(item.id)}/publish-settings`,
        );
        setSupportSettingsById((current) => ({
          ...current,
          [item.id]: mapSupportSpaceSettings(settings),
        }));
        setSeoEntityById((current) => ({
          ...current,
          [item.id]: spaceSeoEntityFromPayload(settings.seoMeta),
        }));
      } catch {
        // keep defaults
      }
    })();
  }, [client]);

  const patchHelpArticle = useCallback(
    (documentId: string, patch: Partial<HelpArticleProperties>) => {
      setHelpArticlePropsById((current) => {
        const selectedDoc = knowledgeDocuments.find((doc) => doc.id === documentId);
        const audience = isSupportSpace
          ? resolveHelpArticleAudience(documentId, audienceById)
          : HELP_ARTICLE_AUDIENCE_GROUP;
        const previous =
          current[documentId] ??
          createDefaultHelpArticleProperties(documentId, audience);
        const next = normalizeHelpArticleProperties({
          ...previous,
          ...patch,
          id: documentId,
          audience: isSupportSpace
            ? (patch.audience ?? previous.audience ?? audience)
            : HELP_ARTICLE_AUDIENCE_GROUP,
        });
        void workspace.updateDocumentPublishFields(documentId, {
          publishStatus: next.status,
          publishSlug: next.slug || null,
          seoTitle: next.seoTitle || null,
          seoDescription: next.seoDescription || null,
          audience: next.audience,
          contactIds: next.contactIds,
          placementFolderId: next.placementFolderId,
        });
        if (isSupportSpace && patch.audience) {
          writeArticleAudience(documentId, patch.audience);
        }
        // Keep slug in sync with path when only status changes from doc row.
        void selectedDoc;
        return {
          ...current,
          [documentId]: next,
        };
      });
    },
    [
      audienceById,
      isSupportSpace,
      knowledgeDocuments,
      workspace,
      writeArticleAudience,
    ],
  );

  const handleHelpContactIdsChange = useCallback(
    (contactIds: string[]) => {
      if (!selected) return;
      patchHelpArticle(selected.id, {
        audience: HELP_ARTICLE_AUDIENCE_INDIVIDUAL,
        contactIds,
      });
    },
    [patchHelpArticle, selected],
  );

  const handleHelpStatusChange = useCallback(
    (status: HelpArticleStatus) => {
      if (!selected) return;
      patchHelpArticle(selected.id, { status });
    },
    [patchHelpArticle, selected],
  );

  const handleHelpFolderChange = useCallback(
    async (folderId: string | null) => {
      if (!selected || !helpArticle) return;
      const currentFolderId = resolveHelpArticleFolderId(selected, {
        audience: helpArticle.audience,
        spaceRootId: spaceRoot?.id ?? null,
        individualRootId: individualRoot?.id ?? null,
      });
      if (currentFolderId === folderId) return;
      const nextParentId =
        folderId ??
        (helpArticle.audience === HELP_ARTICLE_AUDIENCE_INDIVIDUAL
          ? (individualRoot?.id ?? spaceRoot?.id ?? null)
          : (spaceRoot?.id ?? null));
      const result = await workspace.moveDocument(selected.id, nextParentId);
      if (!result.ok) {
        throw new Error(result.error);
      }
      const folder = folderId
        ? scopedDocuments.find(
            (doc) => doc.kind === "folder" && doc.id === folderId,
          )
        : null;
      const nextPrefix = resolveHelpArticleSlugPrefix({
        folderPath: folder?.path ?? null,
        spaceRootPath: spaceRoot?.path ?? null,
      });
      const nextSlug = rewriteHelpArticleSlugPrefix(
        helpArticle.slug,
        nextPrefix,
      );
      if (nextSlug !== helpArticle.slug) {
        patchHelpArticle(selected.id, { slug: nextSlug });
      }
    },
    [
      helpArticle,
      individualRoot?.id,
      patchHelpArticle,
      scopedDocuments,
      selected,
      spaceRoot?.id,
      spaceRoot?.path,
      workspace,
    ],
  );

  const handleCreateFolderFromQuery = useCallback(
    (query: string) => {
      const title = query.trim();
      if (!title || !selected || !helpArticle || !spaceRoot) return;
      void (async () => {
        const created = await workspace.createKnowledgeFolder({
          title,
          parentId: spaceRoot.id,
          parentPath: spaceRoot.path ?? null,
        });
        const result = await workspace.moveDocument(selected.id, created.id);
        if (!result.ok) {
          throw new Error(result.error);
        }
        const nextPrefix = resolveHelpArticleSlugPrefix({
          folderPath: created.path ?? null,
          spaceRootPath: spaceRoot.path ?? null,
        });
        const nextSlug = rewriteHelpArticleSlugPrefix(
          helpArticle.slug,
          nextPrefix,
        );
        if (nextSlug !== helpArticle.slug) {
          patchHelpArticle(selected.id, { slug: nextSlug });
        }
      })();
    },
    [helpArticle, patchHelpArticle, selected, spaceRoot, workspace],
  );

  const handleHelpPlacementChange = useCallback(
    (placementFolderId: string | null) => {
      if (!selected) return;
      const folder = placementFolderId
        ? scopedDocuments.find(
            (doc) => doc.kind === "folder" && doc.id === placementFolderId,
          )
        : null;
      patchHelpArticle(selected.id, {
        audience: HELP_ARTICLE_AUDIENCE_INDIVIDUAL,
        placementFolderId,
        placementFolderTitle: folder?.title ?? null,
        placementFolderPath: folder?.path ?? null,
      });
    },
    [patchHelpArticle, scopedDocuments, selected],
  );

  const handleHelpSeoDetailsChange = useCallback(
    (details: HelpArticleSeoDetails) => {
      if (!selected) return;
      patchHelpArticle(selected.id, details);
    },
    [patchHelpArticle, selected],
  );

  useEffect(() => {
    if (!selected || !helpArticle) return;
    if (!helpArticle.slug.trim()) return;
    const nextSlug = rewriteHelpArticleSlugPrefix(
      helpArticle.slug,
      slugPrefix,
    );
    if (nextSlug === helpArticle.slug) return;
    patchHelpArticle(selected.id, { slug: nextSlug });
  }, [helpArticle, patchHelpArticle, selected, slugPrefix]);

  if (onOverview) {
    return (
      <>
        {keepAliveActive ? (
          <RegisterPageTitle
            active={keepAliveActive}
            href={listHref}
            title={sectionLabel}
          />
        ) : null}
        <div className="detail-with-properties">
          <div className="detail-with-properties__main">
            <SpacesOverviewView
              documents={knowledgeDocuments}
              coverSrcById={spaceCoverSrc}
              loading={!knowledgeReady}
              onSelectSpace={(item) => {
                setSettingsSpace(null);
                navigateToHref(navigate, getDocHref(item.path || item.id));
              }}
              onIconChange={async (item, icon) => {
                const result = await workspace.updateDocumentIcon(item.id, icon);
                if (!result.ok) {
                  throw new Error(result.error);
                }
              }}
              onTitleChange={(item, title) =>
                workspace.renameDocument(item.id, title)
              }
              onCreateSpaceFolder={handleCreateSpaceFolder}
              onReorderSpace={handleReorderSpace}
              onOpenSpaceSettings={handleOpenSpaceSettings}
            />
          </div>
          {settingsSpace ? (
            <ResizableSidePanel
              storageKey={SPACE_SETTINGS_PANEL_WIDTH_KEY}
              defaultWidth={320}
              minWidth={280}
              maxWidth={480}
              edge="start"
              className="detail-properties-panel space-settings-rail"
            >
              <div className="detail-properties-panel__inner">
                <SpaceSettingsSidePanel
                  space={settingsSpace}
                  coverSrc={spaceCoverSrc[settingsSpace.id] ?? null}
                  initialSettings={
                    supportSettingsById[settingsSpace.id] ??
                    DEFAULT_SUPPORT_SPACE_SETTINGS
                  }
                  initialSeo={
                    settingsSpaceSeo ?? {
                      publishSlug: "",
                      seoTitle: "",
                      seoDescription: "",
                    }
                  }
                  initialSeoEntity={settingsSpaceSeoEntity}
                  onClose={() => setSettingsSpace(null)}
                  onDelete={() => requestDeleteSpace(settingsSpace)}
                  onSeoChange={async (seo) => {
                    await workspace.updateDocumentPublishFields(
                      settingsSpace.id,
                      {
                        publishSlug: seo.publishSlug || null,
                        seoTitle: seo.seoTitle || null,
                        seoDescription: seo.seoDescription || null,
                      },
                    );
                  }}
                  onSeoEntityChange={async (entity) => {
                    const seoMeta = spaceSeoEntityToPayload(entity);
                    await client.requestJson(
                      `/api/v1/spaces/${encodeURIComponent(settingsSpace.id)}/publish-settings`,
                      {
                        method: "PUT",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ seoMeta }),
                      },
                    );
                    setSeoEntityById((current) => ({
                      ...current,
                      [settingsSpace.id]: entity,
                    }));
                  }}
                  onCoverUpload={async (file) => {
                    rememberDesktopSpaceCoverPreview(settingsSpace.id, file);
                    try {
                      const document = await client.uploadSpaceCover(
                        settingsSpace.id,
                        file,
                        file.type || undefined,
                      );
                      rememberDesktopSpaceCover(
                        {
                          id: document.id,
                          coverStorageKey: document.coverStorageKey ?? null,
                          updatedAt:
                            typeof document.updatedAt === "string"
                              ? Date.parse(document.updatedAt)
                              : (document.updatedAt as
                                  | number
                                  | null
                                  | undefined) ?? Date.now(),
                        },
                        file,
                      );
                      await workspace.softRefreshApiDocuments({
                        force: true,
                        type: "knowledge",
                      });
                      return { ok: true };
                    } catch (reason) {
                      clearDesktopSpaceCoverPreview(settingsSpace.id);
                      return {
                        ok: false,
                        error:
                          reason instanceof Error
                            ? reason.message
                            : "Could not upload cover.",
                      };
                    }
                  }}
                  onCoverRemove={async () => {
                    clearDesktopSpaceCoverPreview(settingsSpace.id);
                    try {
                      await client.deleteSpaceCover(settingsSpace.id);
                      await workspace.softRefreshApiDocuments({
                        force: true,
                        type: "knowledge",
                      });
                      return { ok: true };
                    } catch (reason) {
                      return {
                        ok: false,
                        error:
                          reason instanceof Error
                            ? reason.message
                            : "Could not remove cover.",
                      };
                    }
                  }}
                  onSave={async (settings) => {
                    const domains = settings.allowedDomains
                      .split(/[\n,]+/)
                      .map((d) => d.trim())
                      .filter(Boolean);
                    await client.requestJson(
                      `/api/v1/spaces/${encodeURIComponent(settingsSpace.id)}/publish-settings`,
                      {
                        method: "PUT",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({
                          publicBaseUrl: settings.publicBaseUrl || null,
                          allowedDomains: domains,
                        }),
                      },
                    );
                    setSupportSettingsById((current) => ({
                      ...current,
                      [settingsSpace.id]: settings,
                    }));
                  }}
                  onCreateSiteKey={async (label) => {
                    const result = await client.requestJson<{
                      siteKey: string;
                      key: SpaceSiteKeyInfo;
                      settings: SpacePublishSettingsResponse;
                    }>(
                      `/api/v1/spaces/${encodeURIComponent(settingsSpace.id)}/site-key`,
                      {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ label }),
                      },
                    );
                    const next = mapSupportSpaceSettings(result.settings);
                    setSupportSettingsById((current) => ({
                      ...current,
                      [settingsSpace.id]: next,
                    }));
                    return {
                      siteKey: result.siteKey,
                      key: result.key,
                      siteKeys: next.siteKeys,
                    };
                  }}
                  onRevokeSiteKey={async (keyId) => {
                    const settings =
                      await client.requestJson<SpacePublishSettingsResponse>(
                        `/api/v1/spaces/${encodeURIComponent(settingsSpace.id)}/site-key/${encodeURIComponent(keyId)}`,
                        { method: "DELETE" },
                      );
                    const next = mapSupportSpaceSettings(settings);
                    setSupportSettingsById((current) => ({
                      ...current,
                      [settingsSpace.id]: next,
                    }));
                    return { siteKeys: next.siteKeys };
                  }}
                />
              </div>
            </ResizableSidePanel>
          ) : null}
        </div>
      </>
    );
  }

  if (!selected) {
    if (
      routedDocumentPath &&
      !routedIsFolder &&
      knowledgeDocs.length > 0
    ) {
      return (
        <div className="inbox-detail-layout">
          <div className="inbox-detail-empty">
            <p>Document not found.</p>
          </div>
        </div>
      );
    }
    return (
      <DocumentsEmptyCreateView creating={creating} onCreate={handleCreate} />
    );
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
      {isPublishableArticle ? (
        <HelpArticleDetailView
          sectionLabel={
            isSupportSpace
              ? "Support"
              : isWebsiteSpace
                ? "Website"
                : "Knowledge"
          }
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
            const content = helpArticle
              ? serializeSpacesDocumentBody({
                  body: nextEditorBody,
                  title: selected.title,
                  status: helpArticle.status,
                  slug: helpArticle.slug,
                  seoTitle: helpArticle.seoTitle,
                  seoDescription: helpArticle.seoDescription,
                  audience: helpArticle.audience,
                })
              : serializeDocumentBody(nextEditorBody);
            await onSave(content);
          }}
          onSaveTitle={async (title) =>
            workspace.renameDocument(selected.id, title)
          }
          article={helpArticle}
          contactOptions={isSupportSpace ? contactOptions : undefined}
          slugPrefix={slugPrefix}
          folderId={selectedFolderId}
          folderOptions={folderOptions}
          placementOptions={isSupportSpace ? placementOptions : undefined}
          onContactIdsChange={
            isSupportSpace ? handleHelpContactIdsChange : undefined
          }
          onStatusChange={handleHelpStatusChange}
          onFolderChange={handleHelpFolderChange}
          onCreateFolderFromQuery={handleCreateFolderFromQuery}
          onSeoDetailsChange={
            showSeoDetails ? handleHelpSeoDetailsChange : undefined
          }
          showSeoDetails={showSeoDetails}
          onPlacementChange={
            isSupportSpace ? handleHelpPlacementChange : undefined
          }
        />
      ) : (
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
      )}
    </>
  );
}

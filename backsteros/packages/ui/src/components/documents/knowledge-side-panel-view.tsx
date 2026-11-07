"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";

import {
  getKnowledgeHref,
  getSelectedKnowledgeSlugFromPathname,
  type KnowledgeListItem,
} from "../../navigation/entity-routes.js";
import {
  buildDocumentTree,
  countDocumentTreeFolderItems,
  findDocumentTreeNodeById,
  flattenVisibleDocumentTreeNavItemIds,
  formatFolderDeleteConfirmLabel,
  parseFolderNavId,
} from "../../documents/document-tree.js";
import { registerDocumentTreeCreateFolderHandler } from "../../documents/document-tree-create-folder-shortcut.js";
import { registerDocumentTreeDeleteResolver } from "../../documents/document-tree-delete-shortcut.js";
import type { TreeReorderRequest } from "../../documents/document-tree-drag.js";
import type { TreeDragPayload } from "../../documents/document-tree-order.js";
import { getFocusedListKeyboardItemId } from "../../list-nav/focused-list-keyboard-item.js";
import { DOCUMENT_TREE_CREATE_FOLDER_SHORTCUT_HINT } from "../../documents/should-handle-document-tree-create-folder-shortcut.js";
import { AddFolderInline } from "./add-folder-inline.js";
import { ContentSidePanelHeader } from "../content/content-side-panel-header.js";
import {
  ContentSidePanelEmpty,
  ContentSidePanelList,
} from "../content/content-side-panel-list.js";
import {
  DocumentTreeNodeView,
  type DocumentTreeIndividualCardMeta,
} from "./document-tree.js";
import { FolderPlusIcon } from "../icons/folder-plus-icon.js";
import { SidePanelPlusIcon } from "../shell/side-panel-plus-icon.js";
import { KnowledgeSidePanelSkeleton } from "../skeletons/knowledge-detail-skeleton.js";
import { KnowledgeSidePanelScopeFooter } from "../spaces/knowledge-side-panel-scope-footer.js";
import { FolderPortalSettingsModal } from "../spaces/folder-portal-settings-modal.js";
import {
  HelpArticleIndividualListItemCard,
  type HelpArticleIndividualListContact,
} from "../spaces/help-article-individual-list-item-card.js";
import { StatusGroupSection } from "../list-nav/status-group-section.js";
import { AssigneeListMark } from "../tasks/assignee-list-mark.js";
import type { HelpArticleAudience } from "../../spaces/help-article-properties.js";
import { formatHelpArticlePlacementPath } from "../../spaces/help-article-placement.js";
import { groupHelpArticleIndividualDocumentsByContact } from "../../spaces/help-article-individual-groups.js";
import {
  folderPortalPropertiesFromDocument,
  type FolderPortalProperties,
} from "../../spaces/folder-portal-properties.js";

const INDIVIDUAL_CONTACT_GROUP_HEADER_STYLE: CSSProperties = {
  backgroundColor: "transparent",
  backgroundImage: "none",
  backdropFilter: "none",
  WebkitBackdropFilter: "none",
  paddingLeft: 0,
  paddingRight: 0,
};

const NO_CONTACTS_GROUP_KEY = "no-contacts";

function individualContactGroupKey(contactId: string | null): string {
  return contactId ?? NO_CONTACTS_GROUP_KEY;
}

export type KnowledgeSidePanelLinkComponent = ComponentType<{
  to: string;
  className?: string;
  "aria-current"?: "page";
  children: ReactNode;
  [key: string]: unknown;
}>;

export type KnowledgeSidePanelMutationResult =
  | { ok: true }
  | { ok: false; error: string };

export type KnowledgeSidePanelViewProps = {
  pathname: string;
  items: KnowledgeListItem[];
  Link: KnowledgeSidePanelLinkComponent;
  /** Create a document under the selected folder (or root). */
  onAdd?: (parentFolderId: string | null) => void;
  onCreateFolder?: (input: {
    title: string;
    parentId: string | null;
  }) => Promise<KnowledgeSidePanelMutationResult>;
  onRename?: (
    id: string,
    title: string,
  ) => Promise<KnowledgeSidePanelMutationResult>;
  onDelete?: (
    id: string,
  ) => Promise<KnowledgeSidePanelMutationResult>;
  /** Persist portal slug / icon / description for a Spaces folder. */
  onSaveFolderPortalProperties?: (
    folderId: string,
    next: FolderPortalProperties,
  ) => Promise<KnowledgeSidePanelMutationResult>;
  onReorderTreeItem?: (request: TreeReorderRequest) => void;
  highlightedId?: string | null;
  listRef?: Ref<HTMLElement>;
  listContainerProps?: HTMLAttributes<HTMLElement>;
  /** Visible keyboard-nav ids (documents + `folder:` ids). */
  onVisibleNavItemIdsChange?: (ids: string[]) => void;
  /** Activate a folder from external keyboard navigation. */
  onFolderActivateRef?: Ref<(folderId: string) => void>;
  /** Show tree skeleton while workspace metadata is loading. */
  loading?: boolean;
  getDocumentHref?: (pathOrId?: string) => string;
  getSelectedSlugFromPathname?: (pathname: string) => string | null;
  title?: string;
  /**
   * Support center: Group / Individual list toggle at the bottom of the panel.
   * Omit for Knowledge Base / Websites.
   */
  listScope?: HelpArticleAudience | null;
  onListScopeChange?: (scope: HelpArticleAudience) => void;
  /**
   * Contact lookup for Individual list cards (id → name / avatar).
   * Only used when `listScope === "individual"`.
   */
  contactById?: ReadonlyMap<string, HelpArticleIndividualListContact>;
  /**
   * Full space document set used to resolve Appears-in folder titles for
   * Individual cards (panel `items` alone omit Group folders).
   */
  placementDocuments?: readonly KnowledgeListItem[];
};

function toTreeSource(item: KnowledgeListItem) {
  return {
    id: item.id,
    title: item.title,
    path: item.path ?? item.id,
    kind: item.kind === "folder" ? ("folder" as const) : ("document" as const),
    parentId: item.parentId ?? null,
    sortOrder: item.sortOrder ?? 0,
    icon: item.icon ?? null,
  };
}

export function KnowledgeSidePanelView({
  pathname,
  items,
  Link,
  onAdd,
  onCreateFolder,
  onRename,
  onDelete,
  onSaveFolderPortalProperties,
  onReorderTreeItem,
  highlightedId = null,
  listRef,
  listContainerProps,
  onVisibleNavItemIdsChange,
  onFolderActivateRef,
  loading = false,
  getDocumentHref = getKnowledgeHref,
  getSelectedSlugFromPathname = getSelectedKnowledgeSlugFromPathname,
  title = "Spaces",
  listScope = null,
  onListScopeChange,
  contactById,
  placementDocuments,
}: KnowledgeSidePanelViewProps) {
  const selectedSlug = getSelectedSlugFromPathname(pathname);
  const [addingFolder, setAddingFolder] = useState(false);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [configureFolderId, setConfigureFolderId] = useState<string | null>(
    null,
  );
  const [configureSaving, setConfigureSaving] = useState(false);
  const [configureError, setConfigureError] = useState<string | null>(null);
  const [activeDragPayload, setActiveDragPayload] =
    useState<TreeDragPayload | null>(null);
  const [dragInsertBeforeId, setDragInsertBeforeId] = useState<string | null>(
    null,
  );
  const [dragIntoFolderId, setDragIntoFolderId] = useState<string | null>(null);

  const tree = useMemo(
    () => buildDocumentTree(items.map(toTreeSource)),
    [items],
  );

  const selectedPath = useMemo(() => {
    if (!selectedSlug) return null;
    const match = items.find(
      (item) =>
        selectedSlug === item.id ||
        selectedSlug === item.path ||
        selectedSlug === (item.path ?? item.id),
    );
    return match?.path ?? selectedSlug;
  }, [items, selectedSlug]);

  const useIndividualCards = listScope === "individual";
  const [collapsedContactGroupKeys, setCollapsedContactGroupKeys] = useState<
    Set<string>
  >(() => new Set());

  const individualContactGroups = useMemo(() => {
    if (!useIndividualCards) return null;
    return groupHelpArticleIndividualDocumentsByContact(items, contactById);
  }, [contactById, items, useIndividualCards]);

  const handleToggleContactGroup = useCallback((groupKey: string) => {
    setCollapsedContactGroupKeys((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }, []);

  const visibleNavItemIds = useMemo(() => {
    if (individualContactGroups) {
      return individualContactGroups.flatMap((group) => {
        const key = individualContactGroupKey(group.contactId);
        if (collapsedContactGroupKeys.has(key)) return [];
        return group.items.map((item) => item.id);
      });
    }
    return flattenVisibleDocumentTreeNavItemIds(tree, collapsedFolderIds);
  }, [
    collapsedContactGroupKeys,
    collapsedFolderIds,
    individualContactGroups,
    tree,
  ]);

  useEffect(() => {
    onVisibleNavItemIdsChange?.(visibleNavItemIds);
  }, [onVisibleNavItemIdsChange, visibleNavItemIds]);

  const handleToggleFolderCollapsed = useCallback((folderId: string) => {
    setCollapsedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  const activateFolder = useCallback(
    (folderId: string) => {
      setSelectedFolderId(folderId);
      handleToggleFolderCollapsed(folderId);
    },
    [handleToggleFolderCollapsed],
  );

  useEffect(() => {
    if (!onFolderActivateRef) return;
    if (typeof onFolderActivateRef === "function") {
      onFolderActivateRef(activateFolder);
      return;
    }
    onFolderActivateRef.current = activateFolder;
  }, [activateFolder, onFolderActivateRef]);

  useEffect(() => {
    return registerDocumentTreeCreateFolderHandler(() => {
      if (!onCreateFolder || addingFolder) return false;
      setAddingFolder(true);
      return true;
    });
  }, [addingFolder, onCreateFolder]);

  useEffect(() => {
    if (!onDelete) return;
    return registerDocumentTreeDeleteResolver(() => {
      const focusedItemId = getFocusedListKeyboardItemId();
      if (!focusedItemId) return null;

      const folderId = parseFolderNavId(focusedItemId);
      if (folderId === null) return null;

      const node = findDocumentTreeNodeById(tree, folderId);
      if (!node || node.type !== "folder") return null;

      const itemCount = countDocumentTreeFolderItems(node);

      return {
        entityLabel: `folder "${node.title}"`,
        confirmLabel: formatFolderDeleteConfirmLabel(itemCount),
        onDelete: async () => {
          const result = await onDelete(folderId);
          if (!result.ok) return result;
          return { ok: true as const };
        },
      };
    });
  }, [onDelete, tree]);

  const handleTreeDragEnd = useCallback(() => {
    setActiveDragPayload(null);
    setDragInsertBeforeId(null);
    setDragIntoFolderId(null);
  }, []);

  const handleReorderTreeItem = useCallback(
    (request: TreeReorderRequest) => {
      handleTreeDragEnd();
      onReorderTreeItem?.(request);
    },
    [handleTreeDragEnd, onReorderTreeItem],
  );

  const showList = items.length > 0 || addingFolder;
  const showLoadingSkeleton = loading && items.length === 0 && !addingFolder;
  const showScopeFooter =
    listScope != null && typeof onListScopeChange === "function";

  const configureFolder = useMemo(
    () =>
      configureFolderId
        ? (items.find((item) => item.id === configureFolderId) ?? null)
        : null,
    [configureFolderId, items],
  );

  const individualCardMetaById = useMemo(() => {
    if (!useIndividualCards) return undefined;
    const placementSource = placementDocuments ?? items;
    const placementById = new Map(
      placementSource
        .filter((doc) => doc.kind === "folder")
        .map((doc) => [doc.id, doc] as const),
    );
    const meta = new Map<string, DocumentTreeIndividualCardMeta>();
    for (const item of items) {
      if (item.kind === "folder") continue;
      const contactIds = item.contactIds ?? [];
      const contacts: HelpArticleIndividualListContact[] = [];
      for (const contactId of contactIds) {
        const known = contactById?.get(contactId);
        contacts.push(
          known ?? {
            id: contactId,
            name: contactId,
            avatarSrc: null,
          },
        );
      }
      const placement = item.placementFolderId
        ? placementById.get(item.placementFolderId)
        : null;
      const appearsInLabel = placement
        ? formatHelpArticlePlacementPath(placement.path ?? placement.title) ||
          placement.title
        : null;
      meta.set(item.id, {
        status: item.publishStatus,
        contacts,
        appearsInLabel,
      });
    }
    return meta;
  }, [contactById, items, placementDocuments, useIndividualCards]);

  return (
    <div
      className={[
        "app-content-side-panel",
        "app-content-side-panel--documents",
        showScopeFooter ? "knowledge-side-panel--with-scope-footer" : null,
        individualContactGroups
          ? "help-article-individual-contact-groups"
          : null,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <ContentSidePanelHeader
        title={title}
        actions={
          <>
            {onAdd ? (
              <button
                type="button"
                className="app-side-panel-section-action"
                aria-label="Create document"
                onClick={() => onAdd(selectedFolderId)}
              >
                <SidePanelPlusIcon />
              </button>
            ) : null}
            {onCreateFolder ? (
              <button
                type="button"
                className="app-side-panel-section-action"
                aria-label={`Create folder (${DOCUMENT_TREE_CREATE_FOLDER_SHORTCUT_HINT})`}
                title={`Create folder (${DOCUMENT_TREE_CREATE_FOLDER_SHORTCUT_HINT})`}
                onClick={() => setAddingFolder(true)}
              >
                <FolderPlusIcon className="size-3.5" />
              </button>
            ) : null}
          </>
        }
      />
      <div className="app-content-side-panel-main">
        {addingFolder && onCreateFolder ? (
          <div className="app-content-side-panel-inline">
            <AddFolderInline
              onCancel={() => setAddingFolder(false)}
              onSubmit={async (name) =>
                onCreateFolder({ title: name, parentId: selectedFolderId })
              }
            />
          </div>
        ) : null}
        {!showList ? (
          showLoadingSkeleton ? (
            <KnowledgeSidePanelSkeleton />
          ) : (
            <ContentSidePanelEmpty>
              {listScope === "individual"
                ? "No individual articles yet. Use the plus button to add one."
                : "No documents yet. Use the plus button to add one."}
            </ContentSidePanelEmpty>
          )
        ) : (
          <ContentSidePanelList
            aria-label="Knowledge documents"
            ref={listRef}
            {...listContainerProps}
          >
            {individualContactGroups
              ? individualContactGroups.map((group) => {
                  const groupKey = individualContactGroupKey(group.contactId);
                  const collapsed = collapsedContactGroupKeys.has(groupKey);
                  return (
                    <StatusGroupSection
                      key={groupKey}
                      groupKey={groupKey}
                      title={group.label}
                      collapsed={collapsed}
                      onToggle={() => handleToggleContactGroup(groupKey)}
                      headerStyle={INDIVIDUAL_CONTACT_GROUP_HEADER_STYLE}
                      icon={
                        <AssigneeListMark
                          label={group.label}
                          avatarSrc={group.avatarSrc}
                          unassigned={group.contactId == null}
                          size={14}
                        />
                      }
                    >
                      {group.items.map((item) => {
                        const meta = individualCardMetaById?.get(item.id);
                        const href = getDocumentHref(item.path ?? item.id);
                        const isSelected =
                          selectedPath != null &&
                          (item.path === selectedPath ||
                            item.id === selectedPath);
                        return (
                          <li
                            key={item.id}
                            className="list-none inbox-list-item"
                          >
                            <HelpArticleIndividualListItemCard
                              title={item.title}
                              href={href}
                              Link={Link}
                              active={isSelected}
                              keyboardHighlighted={highlightedId === item.id}
                              itemId={item.id}
                              status={meta?.status ?? item.publishStatus}
                              contacts={meta?.contacts}
                              appearsInLabel={meta?.appearsInLabel}
                              showContacts={false}
                              onActivate={() => setSelectedFolderId(null)}
                            />
                          </li>
                        );
                      })}
                    </StatusGroupSection>
                  );
                })
              : tree.map((node) => (
                  <DocumentTreeNodeView
                    key={node.id}
                    node={node}
                    depth={0}
                    parentId={null}
                    selectedPath={selectedPath}
                    onSelectFolder={setSelectedFolderId}
                    onClearSelectedFolder={() => setSelectedFolderId(null)}
                    onConfigureFolder={
                      onSaveFolderPortalProperties
                        ? (folderId) => {
                            setConfigureError(null);
                            setConfigureFolderId(folderId);
                          }
                        : undefined
                    }
                    collapsedFolderIds={collapsedFolderIds}
                    onToggleFolderCollapsed={handleToggleFolderCollapsed}
                    highlightedNavItemId={highlightedId}
                    getDocumentHref={(path) => getDocumentHref(path)}
                    Link={Link}
                    onRename={onRename}
                    dragInsertBeforeId={dragInsertBeforeId}
                    dragIntoFolderId={dragIntoFolderId}
                    activeDragPayload={activeDragPayload}
                    onDragInsertBeforeId={setDragInsertBeforeId}
                    onDragIntoFolderId={setDragIntoFolderId}
                    onTreeDragStart={setActiveDragPayload}
                    onTreeDragEnd={handleTreeDragEnd}
                    onReorderTreeItem={
                      onReorderTreeItem ? handleReorderTreeItem : undefined
                    }
                  />
                ))}
          </ContentSidePanelList>
        )}
      </div>
      {showScopeFooter && listScope != null && onListScopeChange ? (
        <KnowledgeSidePanelScopeFooter
          scope={listScope}
          onScopeChange={onListScopeChange}
        />
      ) : null}

      {onSaveFolderPortalProperties && configureFolder ? (
        <FolderPortalSettingsModal
          open
          initial={folderPortalPropertiesFromDocument(configureFolder)}
          saving={configureSaving}
          error={configureError}
          onClose={() => {
            if (configureSaving) return;
            setConfigureFolderId(null);
            setConfigureError(null);
          }}
          onSave={async (next) => {
            setConfigureSaving(true);
            setConfigureError(null);
            try {
              const result = await onSaveFolderPortalProperties(
                configureFolder.id,
                next,
              );
              if (!result.ok) {
                setConfigureError(result.error);
                return;
              }
              setConfigureFolderId(null);
            } finally {
              setConfigureSaving(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}

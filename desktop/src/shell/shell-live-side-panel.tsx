import { useMemo, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";

import { primeTabTitle } from "@backsteros/ui/shell";
import {
  getContactsHref,
  getLettersHref,
  getOrganizationsHref,
  getScopedProjectDocumentHref,
  getScopedProjectLetterHref,
  isContactSectionPath,
  isLettersSectionPath,
  isOrganizationSectionPath,
  isProjectDocumentsSectionPath,
  isProjectLettersSectionPath,
} from "@backsteros/ui/navigation";

import { navigateToHref } from "../router/navigate-href";
import {
  useDesktopWorkspaceActions,
  useDesktopWorkspaceDocuments,
  useDesktopWorkspaceMeta,
  useDesktopWorkspacePeople,
  useDesktopWorkspaceProjects,
} from "../lib/workspace-data";
import {
  useDesktopAvatarSrcMap,
  withAvatarSrc,
} from "../lib/avatar-src";
import {
  DesktopContactsSidePanel,
  DesktopFinanceSidePanel,
  DesktopLettersSidePanel,
  DesktopOrganizationsSidePanel,
  DesktopProjectDocumentsSidePanel,
} from "./app-shell-side-panels-lazy";
import { RouterLink } from "./app-shell-links";
import { handleDocumentTreeReorder } from "./document-tree-reorder";

export function LiveSidePanelBody({
  panelPathname,
  showSidePanel,
  activeProject,
  projectRouteScope,
  financeSection,
  sidePanelCollapsed,
  setSidePanelCollapsed,
  onNavigate,
}: {
  panelPathname: string;
  showSidePanel: boolean;
  activeProject: {
    id: string;
    key: string;
  } | null;
  projectRouteScope: ReturnType<
    typeof import("@backsteros/ui/navigation").getProjectRouteScopeFromPathname
  >;
  financeSection: boolean;
  sidePanelCollapsed: boolean;
  setSidePanelCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  onNavigate: (href: string) => void;
}): ReactNode {
  const navigate = useNavigate();
  const { ready } = useDesktopWorkspaceMeta();
  const { letters } = useDesktopWorkspaceProjects();
  const { contacts, organizations } = useDesktopWorkspacePeople();
  const { projectDocuments } = useDesktopWorkspaceDocuments();
  const workspaceActions = useDesktopWorkspaceActions();

  const contactAvatarSrc = useDesktopAvatarSrcMap("contact", contacts);
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    organizations,
  );
  const composeContacts = useMemo(
    () => withAvatarSrc(contacts, contactAvatarSrc),
    [contactAvatarSrc, contacts],
  );
  const sidePanelOrganizations = useMemo(
    () => withAvatarSrc(organizations, organizationAvatarSrc),
    [organizationAvatarSrc, organizations],
  );

  const projectDocumentsForPanel = useMemo(() => {
    if (!activeProject) return [];
    return projectDocuments.filter(
      (document) => document.projectId === activeProject.id,
    );
  }, [activeProject, projectDocuments]);

  const projectLettersForPanel = useMemo(() => {
    if (!activeProject) return [];
    return letters.filter(
      (letter) =>
        letter.projectId === activeProject.id ||
        (letter.projectKey &&
          letter.projectKey.toLowerCase() === activeProject.key.toLowerCase()),
    );
  }, [activeProject, letters]);

  if (!showSidePanel) return null;

  if (isProjectDocumentsSectionPath(panelPathname) && activeProject) {
    const projectKey = activeProject.key;
    return (
      <DesktopProjectDocumentsSidePanel
        onNavigate={onNavigate}
        pathname={panelPathname}
        items={projectDocumentsForPanel}
        getDocumentHref={(pathOrId) =>
          getScopedProjectDocumentHref(projectKey, pathOrId, projectRouteScope)
        }
        onAdd={(parentFolderId) => {
          void workspaceActions
            .createProjectDocument({
              projectId: activeProject.id,
              title: "Untitled",
              parentId: parentFolderId,
            })
            .then((created) => {
              navigateToHref(
                navigate,
                getScopedProjectDocumentHref(
                  projectKey,
                  created.path || created.id,
                  projectRouteScope,
                ),
              );
            });
        }}
        onCreateFolder={async ({ title, parentId }) => {
          try {
            await workspaceActions.createProjectFolder({
              projectId: activeProject.id,
              title,
              parentId,
            });
            return { ok: true };
          } catch (error) {
            return {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Could not create folder.",
            };
          }
        }}
        onRename={(id, title) => workspaceActions.renameDocument(id, title)}
        onDelete={(id) => workspaceActions.deleteDocument(id)}
        onReorderTreeItem={(request) =>
          handleDocumentTreeReorder(
            request,
            projectDocumentsForPanel.map((item) => ({
              id: item.id,
              title: item.title,
              path: item.path ?? item.id,
              kind: item.kind === "folder" ? "folder" : "document",
              parentId: item.parentId ?? null,
              sortOrder: item.sortOrder ?? 0,
              icon: item.icon ?? null,
            })),
            workspaceActions,
          )
        }
      />
    );
  }

  if (isProjectLettersSectionPath(panelPathname) && activeProject) {
    const projectKey = activeProject.key;
    return (
      <DesktopLettersSidePanel
        onNavigate={onNavigate}
        pathname={panelPathname}
        items={projectLettersForPanel}
        loading={!ready}
        getLetterHref={(letter) =>
          getScopedProjectLetterHref(projectKey, letter.number, projectRouteScope)
        }
        onAdd={() => {
          void workspaceActions
            .createLetter({
              title: "New letter",
              projectId: activeProject.id,
            })
            .then((created) => {
              if (created.number == null) return;
              const href = getScopedProjectLetterHref(
                projectKey,
                created.number,
                projectRouteScope,
              );
              primeTabTitle(href, "New letter");
              navigateToHref(navigate, href);
            });
        }}
      />
    );
  }

  if (isLettersSectionPath(panelPathname)) {
    return (
      <DesktopLettersSidePanel
        onNavigate={onNavigate}
        pathname={panelPathname}
        items={letters}
        loading={!ready}
        onAdd={() => {
          void workspaceActions
            .createLetter({ title: "New letter" })
            .then((created) => {
              if (created.number == null) return;
              const href = getLettersHref(created.number);
              primeTabTitle(href, "New letter");
              navigateToHref(navigate, href);
            });
        }}
      />
    );
  }

  if (isContactSectionPath(panelPathname)) {
    return (
      <DesktopContactsSidePanel
        onNavigate={onNavigate}
        pathname={panelPathname}
        items={composeContacts}
        Link={RouterLink}
        onAdd={() => {
          void workspaceActions
            .createContact({ name: "New contact" })
            .then((created) => {
              navigateToHref(navigate, getContactsHref(created.id));
            });
        }}
      />
    );
  }

  if (isOrganizationSectionPath(panelPathname)) {
    return (
      <DesktopOrganizationsSidePanel
        onNavigate={onNavigate}
        pathname={panelPathname}
        items={sidePanelOrganizations}
        Link={RouterLink}
        onAdd={() => {
          void workspaceActions
            .createOrganization({ name: "New organization" })
            .then((created) => {
              navigateToHref(navigate, getOrganizationsHref(created.id));
            });
        }}
      />
    );
  }

  if (financeSection) {
    return (
      <DesktopFinanceSidePanel
        pathname={panelPathname}
        Link={RouterLink}
        collapsed={sidePanelCollapsed}
        onToggleCollapse={() =>
          setSidePanelCollapsed((current) => !current)
        }
        onExpand={() => setSidePanelCollapsed(false)}
      />
    );
  }

  return null;
}

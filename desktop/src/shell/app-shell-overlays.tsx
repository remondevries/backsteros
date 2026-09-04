import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  COMPOSE_KNOWLEDGE_BASE_VALUE,
  ComposeModal,
  buildDocumentFoldersByTarget,
  getInboxTaskRouteHref,
  getKnowledgeHref,
  getProjectDocumentHref,
  getScopedProjectTaskHref,
  isComposeTasksPagePathname,
  primeTabTitle,
} from "@backsteros/ui";
import { useAgentMail } from "../lib/agentmail-context";
import { withAvatarSrc } from "../lib/avatar-src";
import {
  buildDocumentLinkOptions,
  buildEmailLinkOptions,
  buildLetterLinkOptions,
} from "../lib/task-link-picker-options";
import {
  useDesktopWorkspaceActions,
  useDesktopWorkspaceDocuments,
  useDesktopWorkspacePeople,
  useDesktopWorkspaceProjects,
} from "../lib/workspace-data";
import { navigateToHref } from "../router/navigate-href";

export function AppShellOverlays({
  composeOpen,
  onComposeOpenChange,
  pathname,
  search,
  defaultAssigneeId,
  defaultRelatedContactIds = [],
  contactAvatarSrc,
}: {
  composeOpen: boolean;
  onComposeOpenChange: (open: boolean) => void;
  pathname: string;
  search: string;
  defaultAssigneeId: string | null;
  defaultRelatedContactIds?: string[];
  contactAvatarSrc: Record<string, string>;
}) {
  const routerNavigate = useNavigate();
  const navigate = (to: string, options?: { replace?: boolean; state?: unknown }) => {
    navigateToHref(routerNavigate, to, options);
  };
  const agentMail = useAgentMail();
  const { projects, letters } = useDesktopWorkspaceProjects();
  const { contacts } = useDesktopWorkspacePeople();
  const { knowledgeDocuments, projectDocuments } =
    useDesktopWorkspaceDocuments();
  const {
    createInboxTask,
    createProjectTask,
    createKnowledgeDocument,
    createProjectDocument,
  } = useDesktopWorkspaceActions();

  const composeProjects = useMemo(
    () =>
      projects.map((project) => ({
        id: project.id,
        key: project.key,
        name: project.name,
        icon: project.icon ?? null,
        type: project.type ?? null,
        color: null,
        dueDate: project.dueDate ? new Date(project.dueDate) : null,
      })),
    [projects],
  );

  const composeContacts = useMemo(
    () => withAvatarSrc(contacts, contactAvatarSrc),
    [contactAvatarSrc, contacts],
  );

  const documentFoldersByTarget = useMemo(
    () =>
      buildDocumentFoldersByTarget(
        [
          ...knowledgeDocuments.map((document) => ({
            path: document.path ?? "",
            title: document.title,
            kind: document.kind ?? "document",
            type: "knowledge",
            projectId: null,
          })),
          ...projectDocuments.map((document) => ({
            path: document.path ?? "",
            title: document.title,
            kind: document.kind ?? "document",
            type: "project",
            projectId: document.projectId ?? null,
          })),
        ],
        projects,
        COMPOSE_KNOWLEDGE_BASE_VALUE,
      ),
    [knowledgeDocuments, projectDocuments, projects],
  );

  return (
    <ComposeModal
        open={composeOpen}
        onOpenChange={onComposeOpenChange}
        pathname={`${pathname}${search}`}
        projects={composeProjects}
        contacts={composeContacts}
        defaultAssigneeId={defaultAssigneeId}
        defaultRelatedContactIds={defaultRelatedContactIds}
        documentFoldersByTarget={documentFoldersByTarget}
        projectsHref="/projects"
        onNavigate={(href) => navigate(href)}
        documentLinkOptions={buildDocumentLinkOptions(
          [...knowledgeDocuments, ...projectDocuments],
          projects,
        )}
        letterLinkOptions={buildLetterLinkOptions(letters, projects)}
        emailLinkOptions={buildEmailLinkOptions(agentMail.messages)}
        onCreateTask={async (input) => {
          if (input.projectId) {
            const project = projects.find(
              (entry) => entry.id === input.projectId,
            );
            const created = await createProjectTask({
              projectId: input.projectId,
              title: input.title,
              description: input.description,
              status: input.status,
              priority: input.priority,
              assigneeId: input.assigneeId,
              relatedContactIds: input.relatedContactIds,
              dueDate: input.dueDate,
              links: input.links,
            });
            if (project && created.number != null) {
              const href = getScopedProjectTaskHref(
                project.key,
                created.number,
              );
              primeTabTitle(href, input.title);
              return { href };
            }
            const href = `/tasks/${created.id}`;
            primeTabTitle(href, input.title);
            return { href };
          }
          // From Today/Tomorrow/… compose: create a list task (not triage inbox).
          const fromTasksDueList = isComposeTasksPagePathname(pathname);
          const created = await createInboxTask({
            title: input.title,
            description: input.description,
            status: input.status,
            priority: input.priority,
            assigneeId: input.assigneeId,
            relatedContactIds: input.relatedContactIds,
            dueDate: input.dueDate,
            links: input.links,
            inbox: !fromTasksDueList,
          });
          if (fromTasksDueList) {
            const href = `/tasks/${created.id}`;
            primeTabTitle(href, input.title);
            return { href };
          }
          if (created.number != null) {
            const href = getInboxTaskRouteHref({ number: created.number });
            primeTabTitle(href, input.title);
            return { href };
          }
          const href = `/inbox/${created.id}`;
          primeTabTitle(href, input.title);
          return { href };
        }}
        onCreateDocument={async (input) => {
          if (input.target === "knowledge") {
            const created = await createKnowledgeDocument({
              title: input.title,
              folderPath: input.folderPath,
            });
            return {
              href: getKnowledgeHref(created.path || created.id),
            };
          }
          if (!input.projectId) {
            throw new Error("Select a project for this document.");
          }
          const project = projects.find(
            (entry) => entry.id === input.projectId,
          );
          if (!project) {
            throw new Error("Project not found.");
          }
          const created = await createProjectDocument({
            projectId: input.projectId,
            title: input.title,
            folderPath: input.folderPath,
          });
          return {
            href: getProjectDocumentHref(
              project.key,
              created.path || created.id,
            ),
          };
        }}
      />
  );
}

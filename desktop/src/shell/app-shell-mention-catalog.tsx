import { useMemo, type ReactNode } from "react";

import {
  EMPTY_MENTION_CATALOG,
  MentionCatalogProvider,
  mergeMentionCatalogs,
} from "@backsteros/ui";

import { useAgentMail } from "../lib/agentmail-context";
import { useDesktopAvatarSrcMap, withAvatarSrc } from "../lib/avatar-src";
import {
  buildMentionCatalogFromEmailMessages,
  buildMentionCatalogFromWorkspace,
} from "../lib/mention-catalog";
import { needsMentionCatalog } from "../lib/needs-mention-catalog";
import {
  useDesktopWorkspaceDocuments,
  useDesktopWorkspaceInboxItems,
  useDesktopWorkspacePeople,
  useDesktopWorkspaceProjects,
  useDesktopWorkspaceTasks,
} from "../lib/workspace-data";

export { needsMentionCatalog } from "../lib/needs-mention-catalog";

/**
 * Always the same component type around `children`. Switching between
 * EMPTY provider vs Active used to remount ShellRouteContent / TaskListPage
 * on every tasks list↔detail hop (chrome warm pathname flip).
 */
export function AppShellMentionCatalog({
  pathname,
  composeOpen,
  children,
}: {
  pathname: string;
  composeOpen: boolean;
  children: ReactNode;
}) {
  const active = needsMentionCatalog(pathname, composeOpen);
  return (
    <AppShellMentionCatalogTree active={active}>{children}</AppShellMentionCatalogTree>
  );
}

function AppShellMentionCatalogTree({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const inboxItems = useDesktopWorkspaceInboxItems();
  const { allTasks } = useDesktopWorkspaceTasks();
  const { projects, letters, projectSummaries } = useDesktopWorkspaceProjects();
  const { contacts, organizations, contactDetails } =
    useDesktopWorkspacePeople();
  const { knowledgeDocuments, projectDocuments } = useDesktopWorkspaceDocuments();
  const agentMail = useAgentMail();
  const contactAvatarSrc = useDesktopAvatarSrcMap("contact", contacts);
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    organizations,
  );

  const liveCatalog = useMemo(() => {
    const contactsWithAvatars = withAvatarSrc(contacts, contactAvatarSrc);
    const organizationsWithAvatars = withAvatarSrc(
      organizations,
      organizationAvatarSrc,
    );
    const base = buildMentionCatalogFromWorkspace({
      allTasks,
      contacts: contactsWithAvatars,
      contactDetails,
      inboxItems,
      knowledgeDocuments,
      letters,
      organizations: organizationsWithAvatars,
      projectDocuments,
      projectSummaries,
      projects,
    });
    const emails = buildMentionCatalogFromEmailMessages(agentMail.messages);
    if (emails.length === 0) {
      return base;
    }
    return mergeMentionCatalogs(base, {
      ...EMPTY_MENTION_CATALOG,
      emails,
    });
  }, [
    agentMail.messages,
    allTasks,
    contactAvatarSrc,
    contactDetails,
    contacts,
    inboxItems,
    knowledgeDocuments,
    letters,
    organizationAvatarSrc,
    organizations,
    projectDocuments,
    projectSummaries,
    projects,
  ]);

  const catalog = active ? liveCatalog : EMPTY_MENTION_CATALOG;

  return (
    <MentionCatalogProvider catalog={catalog}>{children}</MentionCatalogProvider>
  );
}

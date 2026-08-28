import { useMemo, type ReactNode } from "react";

import {
  EMPTY_MENTION_CATALOG,
  MentionCatalogProvider,
  mergeMentionCatalogs,
  isEmailPath,
  isJournalSectionPath,
  isKnowledgeSectionPath,
  isLettersSectionPath,
  isTaskDetailPath,
} from "@backsteros/ui";

import { useAgentMail } from "../lib/agentmail-context";
import {
  buildMentionCatalogFromEmailMessages,
  buildMentionCatalogFromWorkspace,
} from "../lib/mention-catalog";
import {
  useDesktopWorkspaceDocuments,
  useDesktopWorkspaceInboxItems,
  useDesktopWorkspacePeople,
  useDesktopWorkspaceProjects,
  useDesktopWorkspaceTasks,
} from "../lib/workspace-data";

function needsMentionCatalog(
  pathname: string,
  composeOpen: boolean,
): boolean {
  if (composeOpen) return true;
  if (isTaskDetailPath(pathname)) return true;
  if (isKnowledgeSectionPath(pathname)) return true;
  if (isLettersSectionPath(pathname)) return true;
  if (isJournalSectionPath(pathname)) return true;
  if (isEmailPath(pathname)) return true;
  if (pathname.startsWith("/calendar/meetings/")) return true;
  return false;
}

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
  const { contacts, organizations } = useDesktopWorkspacePeople();
  const { knowledgeDocuments, projectDocuments } = useDesktopWorkspaceDocuments();
  const agentMail = useAgentMail();

  const liveCatalog = useMemo(() => {
    const base = buildMentionCatalogFromWorkspace({
      allTasks,
      contacts,
      inboxItems,
      knowledgeDocuments,
      letters,
      organizations,
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
    contacts,
    inboxItems,
    knowledgeDocuments,
    letters,
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

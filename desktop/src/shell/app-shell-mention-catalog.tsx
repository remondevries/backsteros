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
  useDesktopWorkspaceMeta,
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
  if (!active) {
    return (
      <MentionCatalogProvider catalog={EMPTY_MENTION_CATALOG}>
        {children}
      </MentionCatalogProvider>
    );
  }
  return (
    <AppShellMentionCatalogActive>{children}</AppShellMentionCatalogActive>
  );
}

function AppShellMentionCatalogActive({ children }: { children: ReactNode }) {
  const { inboxItems } = useDesktopWorkspaceMeta();
  const { allTasks } = useDesktopWorkspaceTasks();
  const { projects, letters, projectSummaries } = useDesktopWorkspaceProjects();
  const { contacts, organizations } = useDesktopWorkspacePeople();
  const { knowledgeDocuments, projectDocuments } = useDesktopWorkspaceDocuments();
  const agentMail = useAgentMail();

  const catalog = useMemo(() => {
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

  return (
    <MentionCatalogProvider catalog={catalog}>{children}</MentionCatalogProvider>
  );
}

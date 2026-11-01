import { useMemo } from "react";
import { projectChannelMemberIds } from "@backsteros/contracts";
import {
  buildTaskAgentCandidates,
  taskAgentTabLabel,
  type TaskAgentCandidate,
} from "@backsteros/ui";

import {
  agentReadyForChatRoster,
  useShellAgentRoster,
} from "../shell/use-shell-agent-chat";
import { useDesktopAvatarSrcMap } from "./avatar-src";
import {
  useDesktopWorkspacePeople,
  useDesktopWorkspaceProjects,
} from "./workspace-data";

/**
 * Agents that could work on a codebase task (project lead first) and the
 * label for the task side-panel agent tab.
 */
export function useTaskAgentCandidates(projectKey: string | null): {
  candidates: TaskAgentCandidate[];
  tabLabel: string;
  loading: boolean;
  roomKnown: boolean;
} {
  const roster = useShellAgentRoster();
  const { contacts } = useDesktopWorkspacePeople();
  const { projects } = useDesktopWorkspaceProjects();

  const agentContacts = useMemo(() => {
    const ids = new Set(
      roster.agents
        .map((agent) => agent.contactId?.trim())
        .filter((id): id is string => Boolean(id)),
    );
    return contacts.filter((contact) => ids.has(contact.id));
  }, [contacts, roster.agents]);
  const avatarSrcById = useDesktopAvatarSrcMap("contact", agentContacts);

  const project = projectKey
    ? (projects.find((entry) => entry.key === projectKey) ?? null)
    : null;
  const roomMemberKey = projectChannelMemberIds(project?.channel).join(",");

  const candidates = useMemo(() => {
    return buildTaskAgentCandidates({
      agents: roster.agents.map((agent) => ({
        id: agent.id,
        contactId: agent.contactId,
        name: agent.name,
        role: agent.role,
        enabled: agent.enabled,
        ready: agentReadyForChatRoster(agent),
        grokbotAgentId: agent.grokbotAgentId ?? null,
      })),
      leadAgentContactId: project?.leadAgentContactId ?? null,
      roomMemberIds: roomMemberKey ? roomMemberKey.split(",") : [],
      contactsById: new Map(
        agentContacts.map((contact) => [
          contact.id,
          {
            name: contact.name,
            title: contact.title?.trim() || null,
            avatarSrc: avatarSrcById[contact.id] ?? contact.avatarSrc ?? null,
          },
        ]),
      ),
    });
  }, [
    agentContacts,
    avatarSrcById,
    project?.leadAgentContactId,
    roomMemberKey,
    roster.agents,
  ]);

  return {
    candidates,
    tabLabel: taskAgentTabLabel(candidates),
    loading: roster.loading,
    roomKnown: roomMemberKey.length > 0,
  };
}

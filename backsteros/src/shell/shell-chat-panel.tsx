import { useCallback, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ChatUiDevPreview,
  type ChatThreadPeer,
  type LiveAgentChatHandlers,
} from "@backsteros/ui";

import { markAgentDmSeen } from "../lib/agent-dm-seen";
import { useDesktopAvatarSrcMap } from "../lib/avatar-src";
import { useDesktopWorkspacePeople } from "../lib/workspace-data";
import { navigateToHref } from "../router/navigate-href";
import { useShellAgentChat } from "./use-shell-agent-chat";
import { useShellChatProjects } from "./use-shell-chat-projects";

function markLatestAssistantSeen(thread: {
  id: string;
  messages: ReadonlyArray<{ id: string; role: string }>;
}): void {
  for (let index = thread.messages.length - 1; index >= 0; index -= 1) {
    const message = thread.messages[index];
    if (message?.role === "assistant") {
      markAgentDmSeen(thread.id, message.id);
      return;
    }
  }
}

/**
 * Persistent shell-level ChatThread host. Mounted once outside routed content
 * so scroll, draft, peer/project selection, and running state survive navigation.
 *
 * OS-155: only agents with a webhook URL appear in the roster.
 */
export function ShellChatPanel() {
  const navigate = useNavigate();
  const { contacts } = useDesktopWorkspacePeople();
  const projects = useShellChatProjects();
  const agentChat = useShellAgentChat();

  const onNavigate = useCallback(
    (href: string) => {
      navigateToHref(navigate, href);
    },
    [navigate],
  );

  const webhookContacts = useMemo(() => {
    const byId = new Map(contacts.map((contact) => [contact.id, contact]));
    const ordered: typeof contacts = [];
    for (const agent of agentChat.webhookReadyAgents) {
      const contactId = agent.contactId?.trim();
      if (!contactId) continue;
      const contact = byId.get(contactId);
      if (contact) ordered.push(contact);
    }
    return ordered;
  }, [agentChat.webhookReadyAgents, contacts]);

  const avatarSrcById = useDesktopAvatarSrcMap("contact", webhookContacts);

  const peers = useMemo((): readonly ChatThreadPeer[] => {
    return webhookContacts.map((contact) => ({
      id: contact.id,
      kind: "contact" as const,
      name: contact.name,
      avatarSrc: avatarSrcById[contact.id] ?? contact.avatarSrc ?? null,
    }));
  }, [avatarSrcById, webhookContacts]);

  const liveAgentChat = useMemo((): LiveAgentChatHandlers => {
    const agentIdByContactId = new Map<string, string>();
    for (const [contactId, agent] of agentChat.agentsByContactId) {
      agentIdByContactId.set(contactId, agent.id);
    }
    return {
      agentIdByContactId,
      openThread: async (agentId) => {
        const thread = await agentChat.openThread(agentId);
        markLatestAssistantSeen(thread);
        return thread;
      },
      sendMessage: agentChat.sendMessage,
      getThread: async (threadId) => {
        const thread = await agentChat.getThread(threadId);
        markLatestAssistantSeen(thread);
        return thread;
      },
    };
  }, [agentChat]);

  return (
    <ChatUiDevPreview
      peers={peers}
      projects={projects}
      onNavigate={onNavigate}
      liveAgentChat={liveAgentChat}
      allowEmptyPeers
      webhookSetupHref="/settings/api?type=agent"
      webhookSetupMessage={agentChat.agentsLoadError}
    />
  );
}

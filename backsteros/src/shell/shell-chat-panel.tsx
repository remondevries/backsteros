import { useCallback, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChatUiDevPreview, type LiveAgentChatHandlers } from "@backsteros/ui";

import { navigateToHref } from "../router/navigate-href";
import { useShellAgentChat } from "./use-shell-agent-chat";
import { useShellChatPeers } from "./use-shell-chat-peers";
import { useShellChatProjects } from "./use-shell-chat-projects";

/**
 * Persistent shell-level ChatThread host. Mounted once outside routed content
 * so scroll, draft, peer/project selection, and running state survive navigation.
 */
export function ShellChatPanel() {
  const navigate = useNavigate();
  const peers = useShellChatPeers();
  const projects = useShellChatProjects();
  const agentChat = useShellAgentChat();

  const onNavigate = useCallback(
    (href: string) => {
      navigateToHref(navigate, href);
    },
    [navigate],
  );

  const liveAgentChat = useMemo((): LiveAgentChatHandlers => {
    const agentIdByContactId = new Map<string, string>();
    for (const [contactId, agent] of agentChat.agentsByContactId) {
      agentIdByContactId.set(contactId, agent.id);
    }
    return {
      agentIdByContactId,
      openThread: agentChat.openThread,
      sendMessage: agentChat.sendMessage,
      getThread: agentChat.getThread,
    };
  }, [agentChat]);

  return (
    <ChatUiDevPreview
      peers={peers}
      projects={projects}
      onNavigate={onNavigate}
      liveAgentChat={liveAgentChat}
    />
  );
}

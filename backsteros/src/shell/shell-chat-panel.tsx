import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChatUiDevPreview } from "@backsteros/ui";

import { navigateToHref } from "../router/navigate-href";
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

  const onNavigate = useCallback(
    (href: string) => {
      navigateToHref(navigate, href);
    },
    [navigate],
  );

  return (
    <ChatUiDevPreview
      peers={peers}
      projects={projects}
      onNavigate={onNavigate}
    />
  );
}

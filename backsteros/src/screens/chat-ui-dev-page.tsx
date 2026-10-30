import { useCallback } from "react";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { ChatUiDevPreview } from "@backsteros/ui";

import { navigateToHref } from "../router/navigate-href";
import { useShellChatPeers } from "../shell/use-shell-chat-peers";
import { useShellChatProjects } from "../shell/use-shell-chat-projects";

/**
 * Dev-only ChatThread foundation preview at `/dev/chat-ui`.
 * Hidden outside Vite DEV so production builds never expose it.
 */
export function ChatUiDevPage() {
  if (!import.meta.env.DEV) {
    return <Navigate to="/" replace />;
  }
  return <ChatUiDevPageInner />;
}

function ChatUiDevPageInner() {
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

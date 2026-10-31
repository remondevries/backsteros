import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChatUiDevPreview } from "@backsteros/ui";

import { navigateToHref } from "../router/navigate-href";
import { useShellChatPeers } from "../shell/use-shell-chat-peers";
import { useShellChatProjects } from "../shell/use-shell-chat-projects";

/** Loaded only from the DEV `/dev/chat-ui` route via React.lazy. */
export default function ChatUiDevPageInner() {
  const navigate = useNavigate();
  const peers = useShellChatPeers();
  const { projects } = useShellChatProjects();
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

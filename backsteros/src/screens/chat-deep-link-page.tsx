import { useEffect } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { openShellChatThread } from "../lib/shell-chat-deep-link";

/**
 * In-app router equivalent of `backsteros://chat/<threadId>?message=<id>`.
 * Opens the shell chat panel on that thread, then leaves the URL so the
 * rest of the app keeps its previous content context.
 */
export function ChatDeepLinkPage() {
  const navigate = useNavigate();
  const { threadId } = useParams({ strict: false }) as { threadId?: string };
  const search = useSearch({ strict: false }) as { message?: string };

  useEffect(() => {
    const id = threadId?.trim();
    if (!id) return;
    openShellChatThread(id, search.message ?? null);
    // Replace with home so refreshing does not re-fire; panel stays open.
    void navigate({ to: "/", replace: true });
  }, [navigate, search.message, threadId]);

  return null;
}

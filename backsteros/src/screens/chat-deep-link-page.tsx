import { useEffect } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { resolveStartupLocation } from "../lib/last-location";
import { openShellChatThread } from "../lib/shell-chat-deep-link";
import { navigateToHref } from "../router/navigate-href";

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
    // Skip `/` (StartupRedirect): a persisted `/chat/…` last-location would
    // bounce right back here. Land on the real startup target once.
    void navigateToHref(navigate, resolveStartupLocation(), { replace: true });
  }, [navigate, search.message, threadId]);

  return null;
}

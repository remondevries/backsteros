import { lazy, Suspense } from "react";
import { Navigate } from "@tanstack/react-router";

/**
 * Dev-only ChatThread foundation preview at `/dev/chat-ui`.
 * Production builds always redirect; the preview module is only reachable via
 * the DEV-gated lazy import below (so it stays out of the shell entry).
 */
export function ChatUiDevPage() {
  if (!import.meta.env.DEV) {
    return <Navigate to="/" replace />;
  }
  return (
    <Suspense
      fallback={
        <p className="chat-ui-dev-page-loading">Loading chat preview…</p>
      }
    >
      <ChatUiDevPageInnerLazy />
    </Suspense>
  );
}

const ChatUiDevPageInnerLazy = lazy(() => import("./chat-ui-dev-page-inner"));

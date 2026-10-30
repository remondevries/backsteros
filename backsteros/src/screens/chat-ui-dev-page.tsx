import { Navigate } from "@tanstack/react-router";
import { ChatUiDevPreview } from "@backsteros/ui";

/**
 * Dev-only ChatThread foundation preview at `/dev/chat-ui`.
 * Hidden outside Vite DEV so production builds never expose it.
 */
export function ChatUiDevPage() {
  if (!import.meta.env.DEV) {
    return <Navigate to="/" replace />;
  }
  return <ChatUiDevPreview />;
}

import {
  createContext,
  memo,
  startTransition,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { EmailListItem, EmailMailbox } from "@backsteros/ui";

import { shouldLiveUpdateAgentMail } from "./agentmail-live";
import {
  getVisibleKeepAliveSurface,
  subscribeWarmKeepAlive,
} from "./shell-warm-keep-alive";
import { useAgentMailMailboxes } from "./use-agentmail-mailboxes";

type AgentMailContextValue = {
  mailboxes: EmailMailbox[];
  messages: EmailListItem[];
  apiKeyConfigured: boolean;
  loading: boolean;
  messagesLoading: boolean;
  reload: () => Promise<void>;
};

const AgentMailContext = createContext<AgentMailContextValue | null>(null);

const MemoizedChildren = memo(function MemoizedChildren({
  children,
}: {
  children: ReactNode;
}) {
  return children;
});

/**
 * Shared AgentMail list for Inbox, Tasks, and project task surfaces so email
 * rows stay in sync without duplicate fetches.
 *
 * Enable from the keep-alive store (inbox) or the window href (email/compose
 * Outlet). Sticky for the session. Live rebuilds start after the inbox list
 * paints. Hidden inbox does not live-rebuild the list or chrome.
 */
export function AgentMailProvider({ children }: { children: ReactNode }) {
  const visible = useSyncExternalStore(
    subscribeWarmKeepAlive,
    getVisibleKeepAliveSurface,
    getVisibleKeepAliveSurface,
  );
  const live = shouldLiveUpdateAgentMail(visible);
  const [liveAfterPaint, setLiveAfterPaint] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!live) {
      setLiveAfterPaint(false);
      return;
    }
    const frame = requestAnimationFrame(() => setLiveAfterPaint(true));
    return () => cancelAnimationFrame(frame);
  }, [live]);

  useEffect(() => {
    if (!liveAfterPaint) return;
    startTransition(() => {
      setEnabled(true);
    });
  }, [liveAfterPaint]);

  const value = useAgentMailMailboxes(enabled, {
    liveUpdates: liveAfterPaint,
  });
  return (
    <AgentMailContext.Provider value={value}>
      <MemoizedChildren>{children}</MemoizedChildren>
    </AgentMailContext.Provider>
  );
}

export function useAgentMail(): AgentMailContextValue {
  const value = useContext(AgentMailContext);
  if (!value) {
    throw new Error("useAgentMail must be used within AgentMailProvider");
  }
  return value;
}

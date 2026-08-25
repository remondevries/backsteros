import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import type { EmailListItem, EmailMailbox } from "@backsteros/ui";
import { isEmailPath, isInboxPath } from "@backsteros/ui";

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

function pathNeedsAgentMail(pathname: string): boolean {
  return (
    isInboxPath(pathname) ||
    isEmailPath(pathname) ||
    pathname.startsWith("/desktop-overlay/compose")
  );
}

/**
 * Shared AgentMail list for Inbox, Tasks, and project task surfaces so email
 * rows stay in sync without duplicate fetches.
 *
 * Fetch is deferred until the user hits inbox/email (sticky for the session)
 * so cold start does not wait on AgentMail settings + message lists.
 */
export function AgentMailProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [enabled, setEnabled] = useState(() =>
    pathNeedsAgentMail(location.pathname),
  );

  useEffect(() => {
    if (pathNeedsAgentMail(location.pathname)) {
      setEnabled(true);
    }
  }, [location.pathname]);

  const value = useAgentMailMailboxes(enabled);
  return (
    <AgentMailContext.Provider value={value}>{children}</AgentMailContext.Provider>
  );
}

export function useAgentMail(): AgentMailContextValue {
  const value = useContext(AgentMailContext);
  if (!value) {
    throw new Error("useAgentMail must be used within AgentMailProvider");
  }
  return value;
}

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import type { EmailListItem, EmailMailbox } from "@backsteros/ui";

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

/**
 * Shared AgentMail list for Inbox, Tasks, and project task surfaces so email
 * rows stay in sync without duplicate fetches.
 */
export function AgentMailProvider({ children }: { children: ReactNode }) {
  const value = useAgentMailMailboxes(true);
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

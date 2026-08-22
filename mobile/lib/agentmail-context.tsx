import { createContext, useContext, type ReactNode } from "react";

import {
  useAgentMailMailboxes,
  type AgentMailListState,
} from "./use-agentmail-mailboxes";

const AgentMailContext = createContext<AgentMailListState | null>(null);

/**
 * Shared AgentMail list for the Email section and Inbox email rows so both
 * surfaces stay in sync without duplicate fetches (desktop parity).
 */
export function AgentMailProvider({ children }: { children: ReactNode }) {
  const value = useAgentMailMailboxes(true);
  return (
    <AgentMailContext.Provider value={value}>
      {children}
    </AgentMailContext.Provider>
  );
}

export function useAgentMail(): AgentMailListState {
  const value = useContext(AgentMailContext);
  if (!value) {
    throw new Error("useAgentMail must be used within AgentMailProvider");
  }
  return value;
}

"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ChatUiCardPart } from "@backsteros/contracts";

/**
 * Optional desktop-provided lookup so chat can resolve `[@task:OS-144]` to a
 * full card from workspace tasks even when the mention catalog is cold/empty.
 */
export type ChatTaskResolveContextValue = {
  /** Lowercased display id → task card part. */
  resolveByDisplayId: (displayId: string) => ChatUiCardPart | null;
};

const ChatTaskResolveContext =
  createContext<ChatTaskResolveContextValue | null>(null);

export function ChatTaskResolveProvider({
  value,
  children,
}: {
  value: ChatTaskResolveContextValue;
  children: ReactNode;
}) {
  return (
    <ChatTaskResolveContext.Provider value={value}>
      {children}
    </ChatTaskResolveContext.Provider>
  );
}

export function useChatTaskResolveOptional(): ChatTaskResolveContextValue | null {
  return useContext(ChatTaskResolveContext);
}

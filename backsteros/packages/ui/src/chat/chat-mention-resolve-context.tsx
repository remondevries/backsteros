"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ChatUiCardPart } from "@backsteros/contracts";

/**
 * Optional desktop-provided lookup so chat can resolve mention tokens to full
 * cards from workspace data even when the mention catalog is cold/empty.
 * Keys are lowercased `kind:id` dedupe keys (see `mentionDedupeKey`).
 */
export type ChatMentionResolveContextValue = {
  resolveByKey: (dedupeKey: string) => ChatUiCardPart | null;
};

const ChatMentionResolveContext =
  createContext<ChatMentionResolveContextValue | null>(null);

export function ChatMentionResolveProvider({
  value,
  children,
}: {
  value: ChatMentionResolveContextValue;
  children: ReactNode;
}) {
  return (
    <ChatMentionResolveContext.Provider value={value}>
      {children}
    </ChatMentionResolveContext.Provider>
  );
}

export function useChatMentionResolveOptional(): ChatMentionResolveContextValue | null {
  return useContext(ChatMentionResolveContext);
}

/** @deprecated Prefer {@link ChatMentionResolveContextValue}. */
export type ChatTaskResolveContextValue = {
  resolveByDisplayId: (displayId: string) => ChatUiCardPart | null;
};

/** @deprecated Prefer {@link ChatMentionResolveProvider}. */
export function ChatTaskResolveProvider({
  value,
  children,
}: {
  value: ChatTaskResolveContextValue;
  children: ReactNode;
}) {
  const mapped: ChatMentionResolveContextValue = {
    resolveByKey: (dedupeKey) => {
      const key = dedupeKey.trim().toLowerCase();
      if (!key.startsWith("task:")) return null;
      return value.resolveByDisplayId(key.slice("task:".length));
    },
  };
  return (
    <ChatMentionResolveProvider value={mapped}>
      {children}
    </ChatMentionResolveProvider>
  );
}

/** @deprecated Prefer {@link useChatMentionResolveOptional}. */
export function useChatTaskResolveOptional(): ChatTaskResolveContextValue | null {
  const mention = useContext(ChatMentionResolveContext);
  if (!mention) return null;
  return {
    resolveByDisplayId: (displayId) =>
      mention.resolveByKey(`task:${displayId.trim().toLowerCase()}`),
  };
}

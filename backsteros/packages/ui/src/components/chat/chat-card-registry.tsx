"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ChatUiCardPart, ChatUiTaskCardData } from "@backsteros/contracts";

export type ChatCardRendererProps = {
  part: ChatUiCardPart;
};

export type ChatCardRenderer = (props: ChatCardRendererProps) => ReactNode;

export type ChatCardRegistry = Readonly<Record<string, ChatCardRenderer>>;

const ChatCardRegistryContext = createContext<ChatCardRegistry>({});

export function ChatCardRegistryProvider({
  registry,
  children,
}: {
  registry: ChatCardRegistry;
  children: ReactNode;
}) {
  return (
    <ChatCardRegistryContext.Provider value={registry}>
      {children}
    </ChatCardRegistryContext.Provider>
  );
}

export function useChatCardRegistry(): ChatCardRegistry {
  return useContext(ChatCardRegistryContext);
}

function asTaskCardData(data: ChatUiCardPart["data"]): ChatUiTaskCardData | null {
  if (!data || typeof data !== "object") return null;
  const taskId = data.taskId;
  if (typeof taskId !== "string" || !taskId) return null;
  return {
    taskId,
    displayId: typeof data.displayId === "string" ? data.displayId : undefined,
    title: typeof data.title === "string" ? data.title : undefined,
    href: typeof data.href === "string" ? data.href : undefined,
    status: typeof data.status === "string" ? data.status : undefined,
  };
}

/** Default Task card — links to the task when `href` (or `/tasks/:id`) is set. */
export function ChatTaskCard({ part }: ChatCardRendererProps) {
  const data = asTaskCardData(part.data);
  if (!data) {
    return (
      <div className="chat-ui-card chat-ui-card--task is-invalid">
        Invalid task card
      </div>
    );
  }
  const href = data.href ?? `/tasks/${encodeURIComponent(data.taskId)}`;
  const label = data.displayId ?? data.taskId;
  return (
    <a className="chat-ui-card chat-ui-card--task" href={href}>
      <span className="chat-ui-card__eyebrow">Task</span>
      <span className="chat-ui-card__id">{label}</span>
      {data.title ? (
        <span className="chat-ui-card__title">{data.title}</span>
      ) : null}
      {data.status ? (
        <span className="chat-ui-card__status">{data.status}</span>
      ) : null}
    </a>
  );
}

export const DEFAULT_CHAT_CARD_REGISTRY: ChatCardRegistry = {
  task: ChatTaskCard,
};

export function mergeChatCardRegistry(
  overrides?: ChatCardRegistry | null,
): ChatCardRegistry {
  if (!overrides) return DEFAULT_CHAT_CARD_REGISTRY;
  return { ...DEFAULT_CHAT_CARD_REGISTRY, ...overrides };
}

export function ChatCardPartView({ part }: { part: ChatUiCardPart }) {
  const registry = useChatCardRegistry();
  const Renderer = registry[part.cardType];
  if (!Renderer) {
    return (
      <div className="chat-ui-card chat-ui-card--unknown">
        Unknown card: {part.cardType}
      </div>
    );
  }
  return <Renderer part={part} />;
}

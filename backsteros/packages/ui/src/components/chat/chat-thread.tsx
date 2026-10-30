"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { ChatUiMessage } from "@backsteros/contracts";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type AppendMessage,
} from "@assistant-ui/react";
import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from "@legendapp/list/react";

import { chatUiMessageToThreadMessageLike } from "../../chat/chat-ui-to-thread-message.js";
import {
  ChatCardRegistryProvider,
  mergeChatCardRegistry,
  type ChatCardRegistry,
} from "./chat-card-registry.js";
import { ChatUiMessageBody } from "./chat-message-parts.js";

/** Window when the thread is long enough that DOM cost matters. */
export const CHAT_THREAD_VIRTUALIZE_THRESHOLD = 48;

export type ChatThreadProps = {
  messages: readonly ChatUiMessage[];
  /** Called when the composer sends. Parent owns persistence / optimistic rows. */
  onSend?: (text: string) => void | Promise<void>;
  /** Extra / override card renderers (`task` is built in). */
  cardRegistry?: ChatCardRegistry;
  /** Composer placeholder. */
  placeholder?: string;
  /** Disable composer (e.g. while detail loading). */
  composerDisabled?: boolean;
  /** Optional empty state when there are no messages. */
  emptyState?: ReactNode;
  className?: string;
};

function readAppendText(message: AppendMessage): string {
  const parts = message.content;
  if (!Array.isArray(parts)) return "";
  return parts
    .filter(
      (part): part is { type: "text"; text: string } =>
        part != null &&
        typeof part === "object" &&
        "type" in part &&
        part.type === "text" &&
        "text" in part &&
        typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function ChatThreadComposer({
  placeholder,
  disabled,
}: {
  placeholder: string;
  disabled: boolean;
}) {
  return (
    <ComposerPrimitive.Root className="chat-ui-composer">
      <ComposerPrimitive.Input
        className="chat-ui-composer__input"
        placeholder={placeholder}
        rows={1}
        disabled={disabled}
        submitOnEnter
      />
      <ComposerPrimitive.Send
        className="chat-ui-composer__send"
        disabled={disabled}
        aria-label="Send message"
      >
        ↑
      </ComposerPrimitive.Send>
    </ComposerPrimitive.Root>
  );
}

function VirtualizedChatMessages({
  messages,
}: {
  messages: readonly ChatUiMessage[];
}) {
  const listRef = useRef<LegendListRef | null>(null);
  const rows = useMemo(
    () => messages.map((message) => ({ key: message.id, message })),
    [messages],
  );

  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<(typeof rows)[number]>) => (
      <ChatUiMessageBody message={item.message} />
    ),
    [],
  );

  return (
    <LegendList
      ref={listRef}
      className="chat-ui-thread__virtual-list"
      data={rows}
      keyExtractor={(row) => row.key}
      renderItem={renderItem}
      estimatedItemSize={72}
      alignItemsAtEnd
      maintainScrollAtEnd
      maintainScrollAtEndThreshold={0.15}
    />
  );
}

function PlainChatMessages({
  messages,
}: {
  messages: readonly ChatUiMessage[];
}) {
  return (
    <div className="chat-ui-thread__messages">
      {messages.map((message) => (
        <ChatUiMessageBody key={message.id} message={message} />
      ))}
    </div>
  );
}

/**
 * Source-agnostic chat thread built on assistant-ui (ExternalStoreRuntime +
 * Thread/Composer primitives). Renders the shared ChatUiMessage format with
 * streaming/pending states, markdown, expandable tool calls, a card registry,
 * and LegendList virtualization for long threads (scroll anchoring via
 * ThreadPrimitive.Viewport + maintainScrollAtEnd).
 */
export function ChatThread({
  messages,
  onSend,
  cardRegistry,
  placeholder = "Write a message…",
  composerDisabled = false,
  emptyState = null,
  className,
}: ChatThreadProps) {
  const [isRunning, setIsRunning] = useState(false);
  const registry = useMemo(
    () => mergeChatCardRegistry(cardRegistry),
    [cardRegistry],
  );

  const convertMessage = useCallback(
    (message: ChatUiMessage) => chatUiMessageToThreadMessageLike(message),
    [],
  );

  const handleNew = useCallback(
    async (message: AppendMessage) => {
      if (!onSend || composerDisabled) return;
      const text = readAppendText(message);
      if (!text) return;
      setIsRunning(true);
      try {
        await onSend(text);
      } finally {
        setIsRunning(false);
      }
    },
    [composerDisabled, onSend],
  );

  const runtime = useExternalStoreRuntime({
    isRunning,
    messages,
    convertMessage,
    onNew: handleNew,
  });

  const virtualize = messages.length >= CHAT_THREAD_VIRTUALIZE_THRESHOLD;

  // Local form fallback when assistant-ui composer is disabled or onNew absent.
  const [draft, setDraft] = useState("");
  const onFallbackSubmit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !onSend || composerDisabled) return;
    setDraft("");
    void onSend(text);
  };

  return (
    <ChatCardRegistryProvider registry={registry}>
      <AssistantRuntimeProvider runtime={runtime}>
        <div
          className={["chat-ui-thread", className].filter(Boolean).join(" ")}
        >
          <ThreadPrimitive.Root className="chat-ui-thread__root">
            <ThreadPrimitive.Viewport className="chat-ui-thread__viewport">
              {messages.length === 0 ? (
                <div className="chat-ui-thread__empty">
                  {emptyState ?? <p>No messages yet.</p>}
                </div>
              ) : virtualize ? (
                <VirtualizedChatMessages messages={messages} />
              ) : (
                <PlainChatMessages messages={messages} />
              )}
              <ThreadPrimitive.ViewportFooter className="chat-ui-thread__footer">
                {onSend ? (
                  composerDisabled ? (
                    <form
                      className="chat-ui-composer is-disabled"
                      onSubmit={onFallbackSubmit}
                    >
                      <textarea
                        className="chat-ui-composer__input"
                        value={draft}
                        disabled
                        placeholder={placeholder}
                        rows={1}
                        readOnly
                      />
                      <button
                        type="submit"
                        className="chat-ui-composer__send"
                        disabled
                        aria-label="Send message"
                      >
                        ↑
                      </button>
                    </form>
                  ) : (
                    <ChatThreadComposer
                      placeholder={placeholder}
                      disabled={false}
                    />
                  )
                ) : null}
              </ThreadPrimitive.ViewportFooter>
            </ThreadPrimitive.Viewport>
          </ThreadPrimitive.Root>
        </div>
      </AssistantRuntimeProvider>
    </ChatCardRegistryProvider>
  );
}

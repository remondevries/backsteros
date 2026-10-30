"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { ChatUiMessage } from "@backsteros/contracts";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ThreadPrimitive,
  unstable_useComposerInput,
  useExternalStoreRuntime,
  type AppendMessage,
} from "@assistant-ui/react";
import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from "@legendapp/list/react";

import {
  matchPeersBySlashQuery,
  parsePeerSlashCommand,
  resolvePeerSlashCommand,
} from "../../chat/chat-peer-slash-command.js";
import { chatUiMessageToThreadMessageLike } from "../../chat/chat-ui-to-thread-message.js";
import {
  ChatCardNavigateProvider,
  type ChatCardNavigate,
} from "./chat-card-navigate.js";
import {
  ChatCardRegistryProvider,
  mergeChatCardRegistry,
  type ChatCardRegistry,
} from "./chat-card-registry.js";
import { ChatUiMessageBody } from "./chat-message-parts.js";
import {
  ChatThreadHeader,
  type ChatThreadPeer,
} from "./chat-thread-header.js";
import { AssigneeListMark } from "../tasks/assignee-list-mark.js";

/** Window when the thread is long enough that DOM cost matters. */
export const CHAT_THREAD_VIRTUALIZE_THRESHOLD = 48;

export type { ChatThreadPeer };

export type ChatThreadProps = {
  messages: readonly ChatUiMessage[];
  /** Called when the composer sends. Parent owns persistence / optimistic rows. */
  onSend?: (text: string) => void | Promise<void>;
  /** Extra / override card renderers (`task` is built in). */
  cardRegistry?: ChatCardRegistry;
  /**
   * Navigate when a chat entity card is activated (same path as the product
   * nav / `navigateToHref`). Each card type declares its own target href.
   * Cmd/Ctrl-click opens a new product tab via ModClickNewTabListener.
   */
  onNavigate?: ChatCardNavigate | null;
  /**
   * Conversation peers shown in the iMessage-style header. Inactive peers
   * fade; the active one stays full opacity.
   */
  peers?: readonly ChatThreadPeer[];
  /** Focused peer id within `peers`. */
  activePeerId?: string | null;
  /** Switch the focused peer (multi-agent / multi-contact chats). */
  onPeerChange?: (peerId: string) => void;
  /**
   * Single-peer shorthand. Prefer `peers` when showing more than one.
   * Ignored when `peers` is non-empty.
   */
  peer?: ChatThreadPeer | null;
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
  peers,
  onSelectPeer,
}: {
  placeholder: string;
  disabled: boolean;
  peers: readonly ChatThreadPeer[];
  onSelectPeer?: (peerId: string) => void;
}) {
  const { value, setText } = unstable_useComposerInput({ disabled });
  const [highlight, setHighlight] = useState(0);
  const slashQuery = useMemo(() => parsePeerSlashCommand(value), [value]);
  const suggestions = useMemo(() => {
    if (slashQuery == null || !onSelectPeer || peers.length === 0) return [];
    return matchPeersBySlashQuery(peers, slashQuery).slice(0, 8);
  }, [slashQuery, onSelectPeer, peers]);
  const menuOpen = suggestions.length > 0;

  useEffect(() => {
    setHighlight(0);
  }, [slashQuery, suggestions.length]);

  const applyPeer = useCallback(
    (peerId: string) => {
      onSelectPeer?.(peerId);
      setText("");
    },
    [onSelectPeer, setText],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!menuOpen) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((index) => (index + 1) % suggestions.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight(
        (index) => (index - 1 + suggestions.length) % suggestions.length,
      );
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setText("");
      return;
    }
    if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
      event.preventDefault();
      const resolved = resolvePeerSlashCommand(value, peers);
      const peer = resolved ?? suggestions[highlight] ?? suggestions[0];
      if (peer) applyPeer(peer.id);
    }
  };

  return (
    <ComposerPrimitive.Root className="chat-ui-composer">
      {menuOpen ? (
        <div className="chat-ui-composer__slash-menu" role="listbox">
          {suggestions.map((peer, index) => (
            <button
              key={peer.id}
              type="button"
              role="option"
              aria-selected={index === highlight}
              className={[
                "chat-ui-composer__slash-option",
                index === highlight ? "is-active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onMouseDown={(event) => {
                event.preventDefault();
                applyPeer(peer.id);
              }}
            >
              {peer.kind === "contact" ? (
                <AssigneeListMark
                  label={peer.name}
                  avatarSrc={peer.avatarSrc}
                  size={22}
                />
              ) : null}
              <span className="chat-ui-composer__slash-option-copy">
                <span className="chat-ui-composer__slash-option-name">
                  {peer.name}
                </span>
                <span className="chat-ui-composer__slash-option-cmd">
                  /
                  {(peer.name.split(/\s+/)[0] ?? peer.name).toLowerCase()}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <ComposerPrimitive.Input
        className="chat-ui-composer__input"
        placeholder={placeholder}
        rows={1}
        disabled={disabled}
        submitOnEnter={!menuOpen}
        onKeyDown={onKeyDown}
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
  onNavigate = null,
  peers,
  activePeerId = null,
  onPeerChange,
  peer = null,
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
  const resolvedPeers = useMemo((): readonly ChatThreadPeer[] => {
    if (peers && peers.length > 0) return peers;
    return peer ? [peer] : [];
  }, [peers, peer]);
  const resolvedActivePeerId =
    activePeerId ?? resolvedPeers[0]?.id ?? null;
  const hasPeerHeader = resolvedPeers.length > 0;

  const convertMessage = useCallback(
    (message: ChatUiMessage) => chatUiMessageToThreadMessageLike(message),
    [],
  );

  const handleNew = useCallback(
    async (message: AppendMessage) => {
      if (composerDisabled) return;
      const text = readAppendText(message);
      if (!text) return;

      // `/jaap` (etc.) switches the focused peer instead of sending a message.
      if (onPeerChange && resolvedPeers.length > 0) {
        const matched = resolvePeerSlashCommand(text, resolvedPeers);
        if (matched) {
          onPeerChange(matched.id);
          return;
        }
      }

      if (!onSend) return;
      setIsRunning(true);
      try {
        await onSend(text);
      } finally {
        setIsRunning(false);
      }
    },
    [composerDisabled, onPeerChange, onSend, resolvedPeers],
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
    <ChatCardNavigateProvider navigate={onNavigate}>
      <ChatCardRegistryProvider registry={registry}>
        <AssistantRuntimeProvider runtime={runtime}>
          <div
            className={["chat-ui-thread", className].filter(Boolean).join(" ")}
          >
            <ThreadPrimitive.Root
              className={[
                "chat-ui-thread__root",
                hasPeerHeader ? "has-peer-header" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <ChatThreadHeader
                peers={resolvedPeers}
                activePeerId={resolvedActivePeerId}
                onSelectPeer={onPeerChange}
              />
              <ThreadPrimitive.Viewport
                className={[
                  "chat-ui-thread__viewport",
                  virtualize ? "is-virtualized" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                turnAnchor="bottom"
                autoScroll={!virtualize}
                scrollToBottomOnInitialize={!virtualize}
                scrollToBottomOnRunStart={!virtualize}
              >
                {messages.length === 0 ? (
                  <div className="chat-ui-thread__empty">
                    {emptyState ?? <p>No messages yet.</p>}
                  </div>
                ) : virtualize ? (
                  <VirtualizedChatMessages messages={messages} />
                ) : (
                  <PlainChatMessages messages={messages} />
                )}
              </ThreadPrimitive.Viewport>
              {/*
                Composer sits outside the scrollport (sibling of Viewport) so it
                stays pinned while ThreadPrimitive.Viewport owns autoScroll.
              */}
              {onSend ? (
                <div className="chat-ui-thread__footer">
                  {composerDisabled ? (
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
                      placeholder={
                        resolvedPeers.length > 1
                          ? `${placeholder}  ·  /name to switch`
                          : placeholder
                      }
                      disabled={false}
                      peers={resolvedPeers}
                      onSelectPeer={onPeerChange}
                    />
                  )}
                </div>
              ) : null}
            </ThreadPrimitive.Root>
          </div>
        </AssistantRuntimeProvider>
      </ChatCardRegistryProvider>
    </ChatCardNavigateProvider>
  );
}

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { ChatUiFilePart, ChatUiMessage } from "@backsteros/contracts";
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
  collectPendingChatImagesFromDataTransfer,
  pendingChatImagesToFileParts,
  revokePendingChatImages,
  type PendingChatImage,
} from "../../chat/chat-composer-images.js";
import {
  computePlainTextMentionTrigger,
  insertMentionTokenAtTrigger,
  segmentComposerMentionText,
} from "../../chat/chat-composer-mentions.js";
import type { ChatProjectOption } from "../../chat/chat-project-option.js";
import {
  isShellChatPanelCollapsed,
  resolveAdjacentChatPeerId,
  resolveChatPeerNavShortcut,
} from "../../chat/chat-peer-nav-shortcut.js";
import { parsePeerSlashCommand } from "../../chat/chat-peer-slash-command.js";
import {
  buildChatSlashMenu,
  flattenChatSlashMenu,
  resolveChatSlashCommand,
  type ChatSlashMenuItem,
} from "../../chat/chat-slash-menu.js";
import { chatUiMessageToThreadMessageLike } from "../../chat/chat-ui-to-thread-message.js";
import { EMPTY_MENTION_CATALOG } from "../../mentions/empty-catalog.js";
import { useMentionCatalogOptional } from "../../mentions/mention-catalog-context.js";
import {
  buildMentionSections,
  flattenMentionSections,
} from "../../mentions/search-catalog.js";
import { buildMentionToken } from "../../mentions/tokens.js";
import type { MentionItem } from "../../mentions/mention-menu-types.js";
import {
  ChatCardNavigateProvider,
  type ChatCardNavigate,
} from "./chat-card-navigate.js";
import {
  ChatCardRegistryProvider,
  mergeChatCardRegistry,
  type ChatCardRegistry,
} from "./chat-card-registry.js";
import { ChatComposerMentionMenu } from "./chat-composer-mention-menu.js";
import { ChatUiMessageBody } from "./chat-message-parts.js";
import {
  ChatThreadHeader,
  type ChatThreadPeer,
} from "./chat-thread-header.js";
import { MentionLeadingIcon } from "../mentions/mention-leading-icon.js";
import { ProjectOcticon } from "../projects/project-octicon.js";
import { AssigneeListMark } from "../tasks/assignee-list-mark.js";
import { isBlockingModalOpen } from "../../shortcuts/shortcut-guards.js";
import {
  chatSelectModeCountLabel,
  isChatMessageSelectable,
  toggleChatMessageSelection,
} from "../../chat/chat-select-mode.js";
import { useEntityHeaderActionsContextOptional } from "../entity-actions/entity-header-actions-context.js";
import { mentionTokenLabel } from "../../mentions/mention-tokens.js";

/** Window when the thread is long enough that DOM cost matters. */
export const CHAT_THREAD_VIRTUALIZE_THRESHOLD = 48;

export type { ChatThreadPeer };

export type ChatThreadSendPayload = {
  text: string;
  attachments: readonly ChatUiFilePart[];
};

export type ChatThreadProps = {
  messages: readonly ChatUiMessage[];
  /**
   * Called when the composer sends. Parent owns persistence / optimistic rows.
   * `attachments` are pasted/dropped images (ChatUi file parts) ready to store.
   */
  onSend?: (
    text: string,
    attachments?: readonly ChatUiFilePart[],
  ) => void | Promise<void>;
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
  /** Projects offered in the `/` menu (separate “Projects” group). */
  projects?: readonly ChatProjectOption[];
  /** MRU project ids — recent first in the Projects group. */
  recentProjectIds?: readonly string[];
  /** Enter a project room from the `/` menu. */
  onSelectProject?: (projectId: string) => void;
  /** Composer placeholder. */
  placeholder?: string;
  /** Disable composer (e.g. while detail loading). */
  composerDisabled?: boolean;
  /**
   * Soft-delete messages (single or bulk). When set, hover ⋯ + header gear
   * multi-select become available.
   */
  onDeleteMessages?: ((messageIds: readonly string[]) => void | Promise<void>) | null;
  /**
   * Optional empty state when there are no messages.
   * Pass `null` to show no empty-state copy (composer only).
   * Omit to use the default “No messages yet.” label.
   */
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

function ChatSlashOptionIcon({ item }: { item: ChatSlashMenuItem }) {
  if (item.kind === "project") {
    return (
      <span className="chat-ui-composer__slash-option-icon is-project" aria-hidden="true">
        <ProjectOcticon
          icon={item.project.icon}
          type={item.project.type}
          size={14}
        />
      </span>
    );
  }
  if (item.peer.kind === "contact") {
    return (
      <AssigneeListMark
        label={item.peer.name}
        avatarSrc={item.peer.avatarSrc}
        size={22}
      />
    );
  }
  return (
    <span className="chat-ui-composer__slash-option-icon is-project" aria-hidden="true">
      <ProjectOcticon
        icon={item.peer.icon}
        type={item.peer.type}
        size={14}
      />
    </span>
  );
}

function ChatThreadComposer({
  placeholder,
  disabled,
  peers,
  onSelectPeer,
  projects,
  recentProjectIds,
  onSelectProject,
  pendingImages,
  onPendingImagesChange,
  onSendAttachmentsOnly,
}: {
  placeholder: string;
  disabled: boolean;
  peers: readonly ChatThreadPeer[];
  onSelectPeer?: (peerId: string) => void;
  projects: readonly ChatProjectOption[];
  recentProjectIds: readonly string[];
  onSelectProject?: (projectId: string) => void;
  pendingImages: readonly PendingChatImage[];
  onPendingImagesChange: (next: PendingChatImage[]) => void;
  /** Flush image-only sends (assistant-ui skips empty text). */
  onSendAttachmentsOnly: () => void;
}) {
  const { value, setText } = unstable_useComposerInput({ disabled });
  const [highlight, setHighlight] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [mentionDismissedQuery, setMentionDismissedQuery] = useState<
    string | null
  >(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const mentionCatalogApi = useMentionCatalogOptional();
  const mentionCatalog =
    mentionCatalogApi?.catalog ?? EMPTY_MENTION_CATALOG;

  const slashQuery = useMemo(() => parsePeerSlashCommand(value), [value]);
  const slashSections = useMemo(() => {
    if (slashQuery == null) return [];
    return buildChatSlashMenu({
      text: value,
      peers,
      projects,
      recentProjectIds,
    });
  }, [peers, projects, recentProjectIds, slashQuery, value]);
  const slashItems = useMemo(
    () => flattenChatSlashMenu(slashSections),
    [slashSections],
  );
  const slashMenuOpen = slashItems.length > 0;

  const mentionTrigger = useMemo(() => {
    if (slashMenuOpen) return null;
    return computePlainTextMentionTrigger(value, cursor);
  }, [cursor, slashMenuOpen, value]);
  const mentionMenuOpen =
    mentionTrigger != null &&
    mentionDismissedQuery !== (mentionTrigger.query ?? "");
  const mentionFlatItems = useMemo(() => {
    if (!mentionMenuOpen || !mentionTrigger) return [];
    return flattenMentionSections(
      buildMentionSections(mentionCatalog, mentionTrigger.query),
    );
  }, [mentionCatalog, mentionMenuOpen, mentionTrigger]);

  const menuOpen = slashMenuOpen || mentionMenuOpen;
  const hasPendingImages = pendingImages.length > 0;
  const canSend = !disabled && (value.trim().length > 0 || hasPendingImages);
  const mirrorSegments = useMemo(
    () => segmentComposerMentionText(value),
    [value],
  );

  useEffect(() => {
    setHighlight(0);
  }, [slashQuery, slashItems.length, mentionTrigger?.query, mentionFlatItems.length]);

  useEffect(() => {
    if (!mentionTrigger) setMentionDismissedQuery(null);
  }, [mentionTrigger]);

  const syncCursorFromTarget = useCallback(
    (target: EventTarget | null) => {
      if (!(target instanceof HTMLTextAreaElement)) return;
      setCursor(target.selectionStart ?? target.value.length);
    },
    [],
  );

  const applySlashItem = useCallback(
    (item: ChatSlashMenuItem) => {
      setText("");
      if (item.kind === "project") {
        onSelectProject?.(item.project.id);
        return;
      }
      onSelectPeer?.(item.peer.id);
    },
    [onSelectPeer, onSelectProject, setText],
  );

  const applyMentionItem = useCallback(
    (item: MentionItem) => {
      if (!mentionTrigger) return;
      const token = buildMentionToken(item);
      const result = insertMentionTokenAtTrigger(value, mentionTrigger, token);
      setText(result.text);
      setCursor(result.cursor);
      setMentionDismissedQuery(null);
      requestAnimationFrame(() => {
        const textarea = inputWrapRef.current?.querySelector("textarea");
        if (!textarea) return;
        textarea.focus();
        textarea.setSelectionRange(result.cursor, result.cursor);
      });
    },
    [mentionTrigger, setText, value],
  );

  const addImagesFromDataTransfer = useCallback(
    (data: DataTransfer | null | undefined) => {
      const next = collectPendingChatImagesFromDataTransfer(data);
      if (next.length === 0) return false;
      onPendingImagesChange([...pendingImages, ...next]);
      return true;
    },
    [onPendingImagesChange, pendingImages],
  );

  const removePendingImage = useCallback(
    (id: string) => {
      const target = pendingImages.find((image) => image.id === id);
      if (target) revokePendingChatImages([target]);
      onPendingImagesChange(pendingImages.filter((image) => image.id !== id));
    },
    [onPendingImagesChange, pendingImages],
  );

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (disabled) return;
    if (!addImagesFromDataTransfer(event.clipboardData)) return;
    event.preventDefault();
  };

  const onDrop = (event: DragEvent<HTMLFormElement>) => {
    if (disabled) return;
    setDragOver(false);
    if (!addImagesFromDataTransfer(event.dataTransfer)) return;
    event.preventDefault();
  };

  const onDragOver = (event: DragEvent<HTMLFormElement>) => {
    if (disabled) return;
    const types = event.dataTransfer?.types;
    if (!types || ![...types].includes("Files")) return;
    event.preventDefault();
    setDragOver(true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    syncCursorFromTarget(event.currentTarget);
    if (
      !menuOpen &&
      event.key === "Enter" &&
      !event.shiftKey &&
      !value.trim() &&
      hasPendingImages
    ) {
      event.preventDefault();
      onSendAttachmentsOnly();
      return;
    }
    if (mentionMenuOpen) {
      const count = Math.max(mentionFlatItems.length, 1);
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlight((index) => (index + 1) % count);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlight((index) => (index - 1 + count) % count);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMentionDismissedQuery(mentionTrigger?.query ?? "");
        return;
      }
      if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
        const item = mentionFlatItems[highlight] ?? mentionFlatItems[0];
        if (item) {
          event.preventDefault();
          applyMentionItem(item);
        }
        return;
      }
      return;
    }
    if (!slashMenuOpen) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((index) => (index + 1) % slashItems.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight(
        (index) => (index - 1 + slashItems.length) % slashItems.length,
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
      const resolved = resolveChatSlashCommand({
        text: value,
        peers,
        projects,
        recentProjectIds,
      });
      if (resolved?.type === "peer") {
        applySlashItem({
          kind: "peer",
          id: resolved.peer.id,
          label: resolved.peer.name,
          command: resolved.peer.name,
          peer: resolved.peer,
        });
        return;
      }
      if (resolved?.type === "project") {
        applySlashItem({
          kind: "project",
          id: resolved.project.id,
          label: resolved.project.name,
          command: resolved.project.key,
          project: resolved.project,
        });
        return;
      }
      const item = slashItems[highlight] ?? slashItems[0];
      if (item) applySlashItem(item);
    }
  };

  return (
    <ComposerPrimitive.Root
      className={[
        "chat-ui-composer",
        dragOver ? "is-drag-over" : "",
        hasPendingImages ? "has-attachments" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onDragOver={onDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {slashMenuOpen ? (
        <div className="chat-ui-composer__slash-menu" role="listbox">
          {slashSections.map((section) => {
            let sectionOffset = 0;
            for (const prior of slashSections) {
              if (prior.id === section.id) break;
              sectionOffset += prior.items.length;
            }
            return (
              <div
                key={section.id}
                className="chat-ui-composer__slash-section"
                role="group"
                aria-label={section.label}
              >
                <div className="chat-ui-composer__slash-section-label">
                  {section.label}
                </div>
                {section.items.map((item, itemIndex) => {
                  const index = sectionOffset + itemIndex;
                  return (
                    <button
                      key={`${item.kind}-${item.id}`}
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
                        applySlashItem(item);
                      }}
                    >
                      <ChatSlashOptionIcon item={item} />
                      <span className="chat-ui-composer__slash-option-copy">
                        <span className="chat-ui-composer__slash-option-name">
                          {item.label}
                        </span>
                        <span className="chat-ui-composer__slash-option-cmd">
                          /{item.command}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : null}
      {mentionMenuOpen && mentionTrigger ? (
        <ChatComposerMentionMenu
          query={mentionTrigger.query}
          highlight={highlight}
          onHighlightChange={setHighlight}
          onSelect={applyMentionItem}
          catalog={mentionCatalog}
        />
      ) : null}
      {hasPendingImages ? (
        <div className="chat-ui-composer__attachments" aria-label="Attached images">
          {pendingImages.map((image) => (
            <div key={image.id} className="chat-ui-composer__attachment">
              <img
                src={image.previewUrl}
                alt={image.file.name || "Pasted image"}
                className="chat-ui-composer__attachment-thumb"
              />
              <button
                type="button"
                className="chat-ui-composer__attachment-remove"
                aria-label={`Remove ${image.file.name || "image"}`}
                onClick={() => removePendingImage(image.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="chat-ui-composer__row">
        <div className="chat-ui-composer__input-wrap" ref={inputWrapRef}>
          <div className="chat-ui-composer__input-mirror" aria-hidden="true">
            {mirrorSegments.map((segment, index) => {
              if (segment.type === "text") {
                return (
                  <span key={`t-${index}`}>
                    {segment.text.length > 0 ? segment.text : "\u200b"}
                  </span>
                );
              }
              return (
                <span
                  key={`m-${index}-${segment.raw}`}
                  className="chat-ui-composer__mention-chip"
                  title={segment.raw}
                >
                  <MentionLeadingIcon
                    kind={segment.token.kind}
                    status={null}
                  />
                  <span className="chat-ui-composer__mention-chip-label">
                    {mentionTokenLabel(segment.token)}
                  </span>
                </span>
              );
            })}
          </div>
          <ComposerPrimitive.Input
            className="chat-ui-composer__input is-mirrored"
            placeholder={
              hasPendingImages
                ? `${placeholder}  ·  paste more images or send`
                : placeholder
            }
            rows={1}
            disabled={disabled}
            submitOnEnter={!menuOpen && value.trim().length > 0}
            onKeyDown={onKeyDown}
            onKeyUp={(event) => syncCursorFromTarget(event.currentTarget)}
            onClick={(event) => syncCursorFromTarget(event.currentTarget)}
            onSelect={(event) => syncCursorFromTarget(event.currentTarget)}
            onPaste={onPaste}
            onScroll={(event) => {
              const mirror = inputWrapRef.current?.querySelector(
                ".chat-ui-composer__input-mirror",
              );
              if (mirror instanceof HTMLElement) {
                mirror.scrollTop = event.currentTarget.scrollTop;
              }
            }}
          />
        </div>
        {hasPendingImages && !value.trim() ? (
          <button
            type="button"
            className="chat-ui-composer__send"
            disabled={!canSend}
            aria-label="Send message"
            onClick={onSendAttachmentsOnly}
          >
            ↑
          </button>
        ) : (
          <ComposerPrimitive.Send
            className="chat-ui-composer__send"
            disabled={!canSend}
            aria-label="Send message"
          >
            ↑
          </ComposerPrimitive.Send>
        )}
      </div>
    </ComposerPrimitive.Root>
  );
}

type ChatMessagesRenderProps = {
  messages: readonly ChatUiMessage[];
  onDelete?: ((messageId: string) => void | Promise<void>) | null;
  selectMode?: boolean;
  selectedIds?: ReadonlySet<string>;
  onToggleSelect?: ((messageId: string) => void) | null;
};

function VirtualizedChatMessages({
  messages,
  onDelete = null,
  selectMode = false,
  selectedIds,
  onToggleSelect = null,
}: ChatMessagesRenderProps) {
  const listRef = useRef<LegendListRef | null>(null);
  const rows = useMemo(
    () => messages.map((message) => ({ key: message.id, message })),
    [messages],
  );

  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<(typeof rows)[number]>) => (
      <ChatUiMessageBody
        message={item.message}
        onDelete={onDelete}
        selectMode={selectMode}
        selected={selectedIds?.has(item.message.id) ?? false}
        onToggleSelect={onToggleSelect}
      />
    ),
    [onDelete, onToggleSelect, selectMode, selectedIds],
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
  onDelete = null,
  selectMode = false,
  selectedIds,
  onToggleSelect = null,
}: ChatMessagesRenderProps) {
  return (
    <div className="chat-ui-thread__messages">
      {messages.map((message) => (
        <ChatUiMessageBody
          key={message.id}
          message={message}
          onDelete={onDelete}
          selectMode={selectMode}
          selected={selectedIds?.has(message.id) ?? false}
          onToggleSelect={onToggleSelect}
        />
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
  projects = [],
  recentProjectIds = [],
  onSelectProject,
  placeholder = "Message…",
  composerDisabled = false,
  onDeleteMessages = null,
  emptyState,
  className,
}: ChatThreadProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [pendingImages, setPendingImages] = useState<PendingChatImage[]>([]);
  const pendingImagesRef = useRef(pendingImages);
  pendingImagesRef.current = pendingImages;
  const threadRootRef = useRef<HTMLDivElement | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const openDeleteModal =
    useEntityHeaderActionsContextOptional()?.openDeleteModal;

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const enterSelectMode = useCallback(() => {
    setSelectMode(true);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((messageId: string) => {
    setSelectedIds((prev) => toggleChatMessageSelection(prev, messageId));
  }, []);

  const deleteOne = useCallback(
    (messageId: string) => {
      return Promise.resolve(onDeleteMessages?.([messageId]));
    },
    [onDeleteMessages],
  );

  const deleteSelected = useCallback(() => {
    const ids = [...selectedIds].filter((id) =>
      messages.some(
        (message) =>
          message.id === id && isChatMessageSelectable(message.role),
      ),
    );
    if (ids.length === 0) return;

    const runDelete = async () => {
      await onDeleteMessages?.(ids);
      exitSelectMode();
    };

    if (!openDeleteModal) {
      void runDelete();
      return;
    }

    openDeleteModal({
      entityLabel:
        ids.length === 1 ? "this message" : `${ids.length} messages`,
      confirmLabel: "Delete",
      actionVerb: "Delete",
      onDelete: async () => {
        try {
          await runDelete();
          return { ok: true };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Could not delete messages",
          };
        }
      },
    });
  }, [
    exitSelectMode,
    messages,
    onDeleteMessages,
    openDeleteModal,
    selectedIds,
  ]);

  useEffect(() => {
    if (!selectMode) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (isBlockingModalOpen()) return;
      event.preventDefault();
      exitSelectMode();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exitSelectMode, selectMode]);

  useEffect(() => {
    // Drop selection for messages that disappeared (e.g. after delete).
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const alive = new Set(messages.map((message) => message.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (alive.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [messages]);

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

  useEffect(() => {
    return () => {
      revokePendingChatImages(pendingImagesRef.current);
    };
  }, []);

  // ⌥J / ⌥K — previous / next peer while focus is in this chat thread.
  useEffect(() => {
    if (!onPeerChange || resolvedPeers.length < 2) return;

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      const direction = resolveChatPeerNavShortcut(event);
      if (!direction) return;
      if (isBlockingModalOpen()) return;
      if (isShellChatPanelCollapsed()) return;

      const target = event.target;
      const root = threadRootRef.current;
      if (!(target instanceof Node) || !root?.contains(target)) return;

      const nextId = resolveAdjacentChatPeerId(
        resolvedPeers,
        resolvedActivePeerId,
        direction,
      );
      if (!nextId || nextId === resolvedActivePeerId) return;

      event.preventDefault();
      event.stopPropagation();
      onPeerChange?.(nextId);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onPeerChange, resolvedActivePeerId, resolvedPeers]);

  const clearPendingImages = useCallback(() => {
    revokePendingChatImages(pendingImagesRef.current);
    setPendingImages([]);
  }, []);

  const convertMessage = useCallback(
    (message: ChatUiMessage) => chatUiMessageToThreadMessageLike(message),
    [],
  );

  const flushSend = useCallback(
    async (text: string) => {
      if (!onSend || composerDisabled) return;
      const attachments = pendingChatImagesToFileParts(pendingImagesRef.current);
      if (!text.trim() && attachments.length === 0) return;
      setIsRunning(true);
      try {
        await onSend(text, attachments.length > 0 ? attachments : undefined);
        clearPendingImages();
      } finally {
        setIsRunning(false);
      }
    },
    [clearPendingImages, composerDisabled, onSend],
  );

  const handleNew = useCallback(
    async (message: AppendMessage) => {
      if (composerDisabled) return;
      const text = readAppendText(message);
      const hasAttachments = pendingImagesRef.current.length > 0;
      if (!text && !hasAttachments) return;

      // `/jaap`, `/bsh` — peer / project switch commands, not messages.
      if (text && !hasAttachments) {
        const resolved = resolveChatSlashCommand({
          text,
          peers: resolvedPeers,
          projects,
          recentProjectIds,
        });
        if (resolved?.type === "peer") {
          onPeerChange?.(resolved.peer.id);
          return;
        }
        if (resolved?.type === "project") {
          onSelectProject?.(resolved.project.id);
          return;
        }
      }

      await flushSend(text);
    },
    [
      composerDisabled,
      flushSend,
      onPeerChange,
      onSelectProject,
      projects,
      recentProjectIds,
      resolvedPeers,
    ],
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
    const attachments = pendingChatImagesToFileParts(pendingImagesRef.current);
    if ((!text && attachments.length === 0) || !onSend || composerDisabled) {
      return;
    }
    setDraft("");
    void flushSend(text);
  };

  return (
    <ChatCardNavigateProvider navigate={onNavigate}>
      <ChatCardRegistryProvider registry={registry}>
        <AssistantRuntimeProvider runtime={runtime}>
          <div
            ref={threadRootRef}
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
                onEnterSelectMode={onDeleteMessages ? enterSelectMode : null}
              />
              {selectMode ? (
                <div
                  className="chat-ui-thread__select-bar"
                  role="status"
                  aria-live="polite"
                >
                  <span className="chat-ui-thread__select-count">
                    {chatSelectModeCountLabel(selectedIds.size)}
                  </span>
                  <div className="chat-ui-thread__select-actions">
                    <button
                      type="button"
                      className="chat-ui-thread__select-delete"
                      disabled={selectedIds.size === 0}
                      onClick={deleteSelected}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      className="chat-ui-thread__select-cancel"
                      onClick={exitSelectMode}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
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
                  emptyState === null ? null : (
                    <div className="chat-ui-thread__empty">
                      {emptyState ?? <p>No messages yet.</p>}
                    </div>
                  )
                ) : virtualize ? (
                  <VirtualizedChatMessages
                    messages={messages}
                    onDelete={onDeleteMessages ? deleteOne : null}
                    selectMode={selectMode}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                  />
                ) : (
                  <PlainChatMessages
                    messages={messages}
                    onDelete={onDeleteMessages ? deleteOne : null}
                    selectMode={selectMode}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                  />
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
                    placeholder={placeholder}
                    disabled={false}
                    peers={resolvedPeers}
                    onSelectPeer={onPeerChange}
                    projects={projects}
                    recentProjectIds={recentProjectIds}
                    onSelectProject={onSelectProject}
                    pendingImages={pendingImages}
                    onPendingImagesChange={setPendingImages}
                    onSendAttachmentsOnly={() => {
                      void flushSend("");
                    }}
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

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
import { TrashIcon } from "@primer/octicons-react";

import {
  collectPendingChatImagesFromDataTransfer,
  createPendingChatFilesFromList,
  pendingChatImagesToFileParts,
  revokePendingChatImages,
  type PendingChatImage,
} from "../../chat/chat-composer-images.js";
import { computePlainTextMentionTrigger } from "../../chat/chat-composer-mentions.js";
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
  type ChatSlashActionId,
  type ChatSlashMenuItem,
} from "../../chat/chat-slash-menu.js";
import { chatUiMessageToThreadMessageLike } from "../../chat/chat-ui-to-thread-message.js";
import { EMPTY_MENTION_CATALOG } from "../../mentions/empty-catalog.js";
import { useMentionCatalogOptional } from "../../mentions/mention-catalog-context.js";
import {
  buildMentionSections,
  flattenMentionSections,
} from "../../mentions/search-catalog.js";
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
import {
  ChatApprovalAnswerProvider,
  type ChatApprovalAnswerFn,
} from "./chat-approval-card.js";
import {
  ChatChoicesAnswerProvider,
  type ChatChoicesAnswerFn,
} from "./chat-choices-card.js";
import {
  ChatFormAnswerProvider,
  type ChatFormAnswerFn,
} from "./chat-form-card.js";
import {
  ChatEmailDraftAnswerProvider,
  ChatEmailDraftComposeProvider,
  type ChatEmailDraftAnswerFn,
  type ChatEmailDraftComposeContextValue,
} from "./chat-email-draft-card.js";
import { ChatComposerMentionMenu } from "./chat-composer-mention-menu.js";
import {
  applyMentionItemToComposerInput,
  ChatComposerMentionInput,
} from "./chat-composer-mention-input.js";
import { ChatUiMessageBody } from "./chat-message-parts.js";
import {
  ChatThreadHeader,
  type ChatThreadPeer,
} from "./chat-thread-header.js";
import { ProjectOcticon } from "../projects/project-octicon.js";
import { AssigneeListMark } from "../tasks/assignee-list-mark.js";
import { isBlockingModalOpen } from "../../shortcuts/shortcut-guards.js";
import {
  chatSelectModeCountLabel,
  isChatMessageSelectable,
  toggleChatMessageSelection,
} from "../../chat/chat-select-mode.js";
import {
  chatThreadStickAnchor,
  isChatViewportNearBottom,
  scrollChatViewportToBottom,
} from "../../chat/chat-thread-stick-to-bottom.js";
import { useEntityHeaderActionsContextOptional } from "../entity-actions/entity-header-actions-context.js";

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
   * Answer assistant choice buttons (owner). Posts the chosen value(s) as a
   * normal user message via the answer API.
   */
  onAnswerChoices?: ChatChoicesAnswerFn | null;
  /**
   * Answer assistant approval cards (owner). Posts Approved/Rejected as a
   * normal user message via the same answer API.
   */
  onAnswerApproval?: ChatApprovalAnswerFn | null;
  /**
   * Answer assistant form cards (owner). Posts a summary user message via the
   * same answer API.
   */
  onAnswerForm?: ChatFormAnswerFn | null;
  /**
   * Send or discard assistant email draft cards (owner). Server sends via
   * Messages; posts Sent:/Discarded: as a normal user message.
   */
  onAnswerEmailDraft?: ChatEmailDraftAnswerFn | null;
  /**
   * Mailboxes + reply templates for email-draft From picker and letter shell
   * (greeting / sign-off), same source as compose.
   */
  emailDraftCompose?: ChatEmailDraftComposeContextValue | null;
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
  if (item.kind === "action") {
    return (
      <span
        className="chat-ui-composer__slash-option-icon is-command"
        aria-hidden="true"
      >
        <TrashIcon size={12} />
      </span>
    );
  }
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
  enabledSlashActions = [],
  onSlashAction,
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
  enabledSlashActions?: readonly ChatSlashActionId[];
  onSlashAction?: (action: ChatSlashActionId) => void;
  pendingImages: readonly PendingChatImage[];
  onPendingImagesChange: (next: PendingChatImage[]) => void;
  /** Flush image-only sends (assistant-ui skips empty text). */
  onSendAttachmentsOnly: () => void;
}) {
  const { value, setText, send, canSend: composerCanSend } =
    unstable_useComposerInput({ disabled });
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
      enabledActions: enabledSlashActions,
    });
  }, [
    enabledSlashActions,
    peers,
    projects,
    recentProjectIds,
    slashQuery,
    value,
  ]);
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
  const canSend =
    !disabled &&
    (composerCanSend || hasPendingImages) &&
    (value.trim().length > 0 || hasPendingImages);

  useEffect(() => {
    setHighlight(0);
  }, [slashQuery, slashItems.length, mentionTrigger?.query, mentionFlatItems.length]);

  useEffect(() => {
    if (!mentionTrigger) setMentionDismissedQuery(null);
  }, [mentionTrigger]);

  const applySlashItem = useCallback(
    (item: ChatSlashMenuItem) => {
      setText("");
      if (item.kind === "action") {
        onSlashAction?.(item.id);
        return;
      }
      if (item.kind === "project") {
        onSelectProject?.(item.project.id);
        return;
      }
      onSelectPeer?.(item.peer.id);
    },
    [onSelectPeer, onSelectProject, onSlashAction, setText],
  );

  const applyMentionItem = useCallback(
    (item: MentionItem) => {
      if (!mentionTrigger) return;
      const root = inputWrapRef.current?.querySelector(
        ".chat-ui-composer__input",
      );
      if (!(root instanceof HTMLElement)) return;
      const result = applyMentionItemToComposerInput(
        root,
        value,
        cursor,
        item,
        mentionCatalog,
      );
      if (!result) return;
      setText(result.text);
      setCursor(result.cursor);
      setMentionDismissedQuery(null);
      requestAnimationFrame(() => {
        root.focus();
      });
    },
    [cursor, mentionCatalog, mentionTrigger, setText, value],
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

  const onPasteImages = (event: ClipboardEvent<HTMLDivElement>) => {
    if (disabled) return false;
    return addImagesFromDataTransfer(event.clipboardData);
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

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
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
        enabledActions: enabledSlashActions,
      });
      if (resolved?.type === "action") {
        applySlashItem({
          kind: "action",
          id: resolved.action,
          label: resolved.action,
          command: resolved.action,
        });
        return;
      }
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

  const onComposerSubmit = useCallback(() => {
    if (!canSend) return;
    if (!value.trim() && hasPendingImages) {
      onSendAttachmentsOnly();
      return;
    }
    send();
  }, [canSend, hasPendingImages, onSendAttachmentsOnly, send, value]);

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
        <div className="chat-ui-composer__attachments" aria-label="Attachments">
          {pendingImages.map((image) => {
            const isImage = (image.file.type || "").startsWith("image/");
            return (
              <div key={image.id} className="chat-ui-composer__attachment">
                {isImage ? (
                  <img
                    src={image.previewUrl}
                    alt={image.file.name || "Pasted image"}
                    className="chat-ui-composer__attachment-thumb"
                  />
                ) : (
                  <span className="chat-ui-composer__attachment-thumb chat-ui-file-card__glyph">
                    {(image.file.name.split(".").pop() || "FILE")
                      .slice(0, 4)
                      .toUpperCase()}
                  </span>
                )}
                <button
                  type="button"
                  className="chat-ui-composer__attachment-remove"
                  aria-label={`Remove ${image.file.name || "file"}`}
                  onClick={() => removePendingImage(image.id)}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
      <div className="chat-ui-composer__row">
        <label className="chat-ui-composer__attach" title="Attach file">
          <span aria-hidden>+</span>
          <input
            type="file"
            className="chat-ui-composer__attach-input"
            multiple
            disabled={disabled}
            aria-label="Attach file"
            onChange={(event) => {
              const next = createPendingChatFilesFromList(event.target.files);
              event.target.value = "";
              if (next.length === 0) return;
              onPendingImagesChange([...pendingImages, ...next]);
            }}
          />
        </label>
        <div className="chat-ui-composer__input-wrap" ref={inputWrapRef}>
          <ChatComposerMentionInput
            value={value}
            onValueChange={setText}
            onCaretChange={setCursor}
            catalog={mentionCatalog}
            disabled={disabled}
            placeholder={
              hasPendingImages
                ? `${placeholder}  ·  attach more or send`
                : placeholder
            }
            onKeyDown={onKeyDown}
            onPasteImages={onPasteImages}
            onSubmit={menuOpen ? undefined : onComposerSubmit}
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

type VirtualizedChatMessagesProps = ChatMessagesRenderProps & {
  /** Peer / transcript identity — scroll to end when it changes. */
  stickAnchor: string;
};

function VirtualizedChatMessages({
  messages,
  onDelete = null,
  selectMode = false,
  selectedIds,
  onToggleSelect = null,
  stickAnchor,
}: VirtualizedChatMessagesProps) {
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

  useEffect(() => {
    void listRef.current?.scrollToEnd?.({ animated: false });
    const frame = requestAnimationFrame(() => {
      void listRef.current?.scrollToEnd?.({ animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [stickAnchor]);

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
  onAnswerChoices = null,
  onAnswerApproval = null,
  onAnswerForm = null,
  onAnswerEmailDraft = null,
  emailDraftCompose = null,
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

  const clearableMessageIds = useMemo(
    () =>
      messages
        .filter((message) => isChatMessageSelectable(message.role))
        .map((message) => message.id),
    [messages],
  );

  const enabledSlashActions = useMemo((): readonly ChatSlashActionId[] => {
    if (!onDeleteMessages || clearableMessageIds.length === 0) return [];
    return ["clear"];
  }, [clearableMessageIds.length, onDeleteMessages]);

  const clearConversation = useCallback(() => {
    if (!onDeleteMessages || clearableMessageIds.length === 0) return;
    void onDeleteMessages(clearableMessageIds);
    exitSelectMode();
  }, [clearableMessageIds, exitSelectMode, onDeleteMessages]);

  const onSlashAction = useCallback(
    (action: ChatSlashActionId) => {
      if (action === "clear") clearConversation();
    },
    [clearConversation],
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

      // `/jaap`, `/bsh`, `/clear` — commands, not messages.
      if (text && !hasAttachments) {
        const resolved = resolveChatSlashCommand({
          text,
          peers: resolvedPeers,
          projects,
          recentProjectIds,
          enabledActions: enabledSlashActions,
        });
        if (resolved?.type === "action") {
          onSlashAction(resolved.action);
          return;
        }
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
      enabledSlashActions,
      flushSend,
      onPeerChange,
      onSelectProject,
      onSlashAction,
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
  const stickAnchor = chatThreadStickAnchor(resolvedActivePeerId, messages);
  const stickToBottomRef = useRef(true);
  const prevStickPeerRef = useRef(resolvedActivePeerId);

  // Peer switches do not remount assistant-ui's Viewport, and large markdown
  // can grow after the first scrollToBottom — reinforce stick-to-bottom.
  useEffect(() => {
    if (virtualize) return;
    const root = threadRootRef.current;
    if (!root) return;
    const viewport = root.querySelector(".chat-ui-thread__viewport");
    if (!(viewport instanceof HTMLElement)) return;

    const peerChanged = prevStickPeerRef.current !== resolvedActivePeerId;
    prevStickPeerRef.current = resolvedActivePeerId;
    if (peerChanged) stickToBottomRef.current = true;

    const pin = () => {
      if (!stickToBottomRef.current) return;
      scrollChatViewportToBottom(viewport);
    };

    const onScroll = () => {
      stickToBottomRef.current = isChatViewportNearBottom(viewport);
    };

    pin();
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      pin();
      raf2 = requestAnimationFrame(pin);
    });

    const messagesEl = viewport.querySelector(".chat-ui-thread__messages");
    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(pin) : null;
    if (messagesEl && resizeObserver) resizeObserver.observe(messagesEl);

    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      resizeObserver?.disconnect();
      viewport.removeEventListener("scroll", onScroll);
    };
  }, [resolvedActivePeerId, stickAnchor, virtualize]);

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
        <ChatChoicesAnswerProvider onAnswer={onAnswerChoices}>
        <ChatApprovalAnswerProvider onAnswer={onAnswerApproval}>
        <ChatFormAnswerProvider onAnswer={onAnswerForm}>
        <ChatEmailDraftAnswerProvider onAnswer={onAnswerEmailDraft}>
        <ChatEmailDraftComposeProvider value={emailDraftCompose}>
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
                key={resolvedActivePeerId ?? "thread"}
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
                    stickAnchor={stickAnchor}
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
                    enabledSlashActions={enabledSlashActions}
                    onSlashAction={onSlashAction}
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
        </ChatEmailDraftComposeProvider>
        </ChatEmailDraftAnswerProvider>
        </ChatFormAnswerProvider>
        </ChatApprovalAnswerProvider>
        </ChatChoicesAnswerProvider>
      </ChatCardRegistryProvider>
    </ChatCardNavigateProvider>
  );
}

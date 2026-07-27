/**
 * Desktop agent chat composer — Lexical editor with @mentions and / commands.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  listCursorAgentModels,
} from "../lib/pty";
import {
  readAgentChatModelId,
  writeAgentChatModelId,
  type AgentChatModelOption,
} from "../lib/agent/agent-chat-model";
import {
  cycleAgentChatMode,
  readAgentChatMode,
  writeAgentChatMode,
  type AgentChatMode,
} from "../lib/agent/agent-chat-mode";
import type { AgentChatImageAttachment } from "../lib/agent/agent-chat-transcript";
import { DesktopAgentModelPicker } from "./desktop-agent-model-picker";
import { DesktopAgentModePicker } from "./desktop-agent-mode-picker";
import { ComposerCommandMenu } from "./agent-composer/composer-command-menu";
import { searchProjectPaths } from "./agent-composer/composer-file-search";
import {
  detectComposerTrigger,
  replaceTextRange,
  type ComposerTrigger,
} from "./agent-composer/composer-logic";
import { serializeComposerFileLink } from "./agent-composer/composer-mentions";
import {
  ComposerPromptEditor,
  type ComposerPromptEditorHandle,
} from "./agent-composer/composer-prompt-editor";
import {
  pathEntriesToCommandItems,
  searchModelCommandItems,
  searchSlashCommandItems,
  type ComposerCommandItem,
} from "./agent-composer/composer-slash-commands";

export { AGENT_CHAT_COMPOSER_FOCUS_ATTR } from "./agent-composer/composer-focus-attr";

function ComposerSendIcon() {
  return (
    <svg
      className="desktop-agent-chat__send-icon"
      viewBox="0 0 14 14"
      aria-hidden="true"
    >
      <path
        d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ComposerStopIcon() {
  return (
    <svg
      className="desktop-agent-chat__send-icon"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor" />
    </svg>
  );
}

export type DesktopAgentChatComposerHandle = {
  focus: () => void;
  blur: () => void;
  isFocused: () => boolean;
};

export type DesktopAgentChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onCancel?: () => void;
  running?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Project working directory for @ file search. */
  cwd?: string | null;
  /** Controlled agent mode (Build / Ask / Plan). */
  mode?: AgentChatMode;
  /** Image attachments staged for the next send. */
  images?: readonly AgentChatImageAttachment[];
  onImagesChange?: (images: AgentChatImageAttachment[]) => void;
  /** Fired when the composer model chip (or /model) changes. */
  onModelChange?: (modelId: string) => void;
  /** Fired when Build / Ask / Plan (or /build|/ask|/plan) changes. */
  onModeChange?: (mode: AgentChatMode) => void;
  /** Fired for /clear — wipe transcript and reset the agent session. */
  onClearChat?: () => void;
};

const MAX_COMPOSER_IMAGES = 4;
const MAX_COMPOSER_IMAGE_BYTES = 4 * 1024 * 1024;

function newImageId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `img-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function fileToImageAttachment(
  file: File,
): Promise<AgentChatImageAttachment | null> {
  if (!file.type.startsWith("image/")) return null;
  if (file.size > MAX_COMPOSER_IMAGE_BYTES) return null;
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return {
    id: newImageId(),
    name: file.name || "image",
    mimeType: file.type,
    dataBase64: btoa(binary),
  };
}

export const DesktopAgentChatComposer = forwardRef<
  DesktopAgentChatComposerHandle,
  DesktopAgentChatComposerProps
>(function DesktopAgentChatComposer(
  {
    value,
    onChange,
    onSend,
    onCancel,
    running = false,
    disabled = false,
    placeholder = "Message the agent…",
    cwd = null,
    mode,
    images = [],
    onImagesChange,
    onModelChange,
    onModeChange,
    onClearChat,
  },
  ref,
) {
  const editorRef = useRef<ComposerPromptEditorHandle>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [expandedCursor, setExpandedCursor] = useState(value.length);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(
    null,
  );
  const [pathEntries, setPathEntries] = useState<ComposerCommandItem[]>([]);
  const [pathLoading, setPathLoading] = useState(false);
  const [pathError, setPathError] = useState<string | null>(null);
  const [models, setModels] = useState<AgentChatModelOption[]>([
    { id: "auto", displayName: "Auto" },
  ]);
  const pathSearchGen = useRef(0);

  // While the agent is running, Send queues a Cursor-style follow-up.
  const canSend =
    (value.trim().length > 0 || images.length > 0) && !disabled;

  const trigger = useMemo(
    () => detectComposerTrigger(value, expandedCursor),
    [value, expandedCursor],
  );

  const menuItems = useMemo((): ComposerCommandItem[] => {
    if (!trigger) return [];
    if (trigger.kind === "path") return pathEntries;
    if (trigger.kind === "slash-model") {
      return searchModelCommandItems(models, trigger.query);
    }
    return searchSlashCommandItems(trigger.query);
  }, [trigger, pathEntries, models]);

  const menuOpen = Boolean(trigger) && !disabled;

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        editorRef.current?.focus();
      },
      blur: () => {
        editorRef.current?.blur();
      },
      isFocused: () => editorRef.current?.isFocused() ?? false,
    }),
    [],
  );

  useEffect(() => {
    if (!trigger || trigger.kind !== "slash-model") return;
    let cancelled = false;
    void listCursorAgentModels().then((result) => {
      if (cancelled || !result.ok) return;
      setModels(result.models);
    });
    return () => {
      cancelled = true;
    };
  }, [trigger?.kind]);

  useEffect(() => {
    if (!trigger || trigger.kind !== "path") {
      setPathEntries([]);
      setPathLoading(false);
      setPathError(null);
      return;
    }

    const gen = ++pathSearchGen.current;
    setPathLoading(true);
    const handle = window.setTimeout(() => {
      void searchProjectPaths(cwd, trigger.query).then((result) => {
        if (pathSearchGen.current !== gen) return;
        setPathLoading(false);
        setPathError(result.error);
        setPathEntries(pathEntriesToCommandItems(result.entries));
      });
    }, 120);

    return () => {
      window.clearTimeout(handle);
    };
  }, [trigger, cwd]);

  useEffect(() => {
    if (!menuOpen) {
      setHighlightedItemId(null);
      return;
    }
    setHighlightedItemId((prev) => {
      if (prev && menuItems.some((item) => item.id === prev)) return prev;
      return menuItems[0]?.id ?? null;
    });
  }, [menuOpen, menuItems]);

  const applyPromptUpdate = useCallback(
    (nextText: string, nextCursor: number) => {
      onChange(nextText);
      setExpandedCursor(nextCursor);
    },
    [onChange],
  );

  const selectMenuItem = useCallback(
    (item: ComposerCommandItem, activeTrigger: ComposerTrigger) => {
      if (item.type === "path") {
        const mentionPath = item.relativePath || item.path;
        const replacement = `${serializeComposerFileLink(mentionPath)} `;
        const next = replaceTextRange(
          value,
          activeTrigger.rangeStart,
          activeTrigger.rangeEnd,
          replacement,
        );
        applyPromptUpdate(next.text, next.cursor);
        queueMicrotask(() => editorRef.current?.focusAtEnd());
        return;
      }

      if (item.type === "slash-command" && item.command === "model") {
        const next = replaceTextRange(
          value,
          activeTrigger.rangeStart,
          activeTrigger.rangeEnd,
          "/model ",
        );
        applyPromptUpdate(next.text, next.cursor);
        return;
      }

      if (item.type === "slash-command" && item.command === "clear") {
        const next = replaceTextRange(
          value,
          activeTrigger.rangeStart,
          activeTrigger.rangeEnd,
          "",
        );
        applyPromptUpdate(next.text, next.cursor);
        onClearChat?.();
        return;
      }

      if (item.type === "slash-command" && item.mode) {
        writeAgentChatMode(item.mode);
        const next = replaceTextRange(
          value,
          activeTrigger.rangeStart,
          activeTrigger.rangeEnd,
          "",
        );
        applyPromptUpdate(next.text, next.cursor);
        onModeChange?.(item.mode);
        return;
      }

      if (item.type === "model") {
        writeAgentChatModelId(item.modelId);
        const next = replaceTextRange(
          value,
          activeTrigger.rangeStart,
          activeTrigger.rangeEnd,
          "",
        );
        applyPromptUpdate(next.text, next.cursor);
        onModelChange?.(item.modelId);
        // Keep preference label in sync even if model list hasn't loaded yet.
        if (!models.some((m) => m.id === item.modelId)) {
          setModels((prev) => [
            ...prev,
            { id: item.modelId, displayName: item.label },
          ]);
        }
        void readAgentChatModelId();
      }
    },
    [applyPromptUpdate, models, onClearChat, onModeChange, onModelChange, value],
  );

  const acceptHighlighted = useCallback((): boolean => {
    if (!trigger || !menuOpen) return false;
    const item =
      menuItems.find((entry) => entry.id === highlightedItemId) ??
      menuItems[0];
    if (!item) return false;
    selectMenuItem(item, trigger);
    return true;
  }, [highlightedItemId, menuItems, menuOpen, selectMenuItem, trigger]);

  const moveHighlight = useCallback(
    (direction: 1 | -1): boolean => {
      if (!menuOpen || menuItems.length === 0) return false;
      const index = menuItems.findIndex((item) => item.id === highlightedItemId);
      const nextIndex =
        index < 0
          ? 0
          : (index + direction + menuItems.length) % menuItems.length;
      setHighlightedItemId(menuItems[nextIndex]?.id ?? null);
      return true;
    },
    [highlightedItemId, menuItems, menuOpen],
  );

  const handleCommandKeyDown = useCallback(
    (key: "ArrowDown" | "ArrowUp" | "Enter" | "Tab", event: KeyboardEvent) => {
      if (key === "ArrowDown") return moveHighlight(1);
      if (key === "ArrowUp") return moveHighlight(-1);
      if (key === "Tab" && event.shiftKey) {
        // Match Cursor: ⇧Tab cycles Build → Plan → Ask → Debug while composing.
        if (menuOpen) return false;
        const current = mode ?? readAgentChatMode();
        const next = cycleAgentChatMode(current, 1);
        writeAgentChatMode(next);
        onModeChange?.(next);
        return true;
      }
      if (key === "Enter" || key === "Tab") {
        if (menuOpen) return acceptHighlighted();
        return false;
      }
      return false;
    },
    [acceptHighlighted, menuOpen, mode, moveHighlight, onModeChange],
  );

  const handleSubmitEnter = useCallback(() => {
    if (menuOpen && acceptHighlighted()) return;
    const trimmed = value.trim();
    if (trimmed === "/clear" || trimmed.startsWith("/clear ")) {
      onChange("");
      onClearChat?.();
      return;
    }
    // Empty Enter while running → stop (same as the primary Stop control).
    // Non-empty → queue follow-up / send (keyboard path; button stays Stop like T3).
    if (running && !trimmed && images.length === 0) {
      onCancel?.();
      return;
    }
    if (canSend) onSend();
  }, [
    acceptHighlighted,
    canSend,
    images.length,
    menuOpen,
    onCancel,
    onChange,
    onClearChat,
    onSend,
    running,
    value,
  ]);

  const handleEscape = useCallback(() => {
    if (menuOpen && trigger) {
      // Clear the active trigger text range by collapsing query? Prefer blur.
      // Closing: move cursor so trigger dies — simplest is blur.
    }
    editorRef.current?.blur();
  }, [menuOpen, trigger]);

  const handleEditorChange = useCallback(
    (nextValue: string, nextExpandedCursor: number) => {
      onChange(nextValue);
      setExpandedCursor(nextExpandedCursor);
    },
    [onChange],
  );

  const addImageFiles = useCallback(
    async (files: File[]) => {
      // Images on a follow-up still go through ACP when flushed.
      if (!onImagesChange || disabled) return;
      const next = [...images];
      for (const file of files) {
        if (next.length >= MAX_COMPOSER_IMAGES) break;
        const attachment = await fileToImageAttachment(file);
        if (!attachment) continue;
        next.push(attachment);
      }
      onImagesChange(next);
    },
    [disabled, images, onImagesChange],
  );

  const removeImage = useCallback(
    (imageId: string) => {
      if (!onImagesChange) return;
      onImagesChange(images.filter((image) => image.id !== imageId));
    },
    [images, onImagesChange],
  );

  const handleSendClick = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed === "/clear" || trimmed.startsWith("/clear ")) {
      onChange("");
      onClearChat?.();
      return;
    }
    onSend();
  }, [onChange, onClearChat, onSend, value]);

  return (
    <div className="desktop-agent-chat__composer">
      <div
        ref={shellRef}
        className={[
          "desktop-agent-chat__input-shell",
          disabled ? "desktop-agent-chat__input-shell--inactive" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onDragOver={(event) => {
          if (!onImagesChange) return;
          event.preventDefault();
        }}
        onDrop={(event) => {
          if (!onImagesChange) return;
          event.preventDefault();
          const files = [...(event.dataTransfer.files ?? [])].filter((file) =>
            file.type.startsWith("image/"),
          );
          if (files.length > 0) void addImageFiles(files);
        }}
        onPaste={(event) => {
          if (!onImagesChange) return;
          const files = [...(event.clipboardData?.files ?? [])].filter((file) =>
            file.type.startsWith("image/"),
          );
          if (files.length === 0) return;
          event.preventDefault();
          void addImageFiles(files);
        }}
      >
        {menuOpen ? (
          <div className="desktop-agent-chat__command-menu-anchor">
            <ComposerCommandMenu
              items={menuItems}
              isLoading={trigger?.kind === "path" ? pathLoading : false}
              triggerKind={trigger?.kind ?? null}
              emptyStateText={
                trigger?.kind === "path"
                  ? (pathError ?? undefined)
                  : undefined
              }
              activeItemId={highlightedItemId}
              onHighlightedItemChange={setHighlightedItemId}
              onSelect={(item) => {
                if (trigger) selectMenuItem(item, trigger);
              }}
            />
          </div>
        ) : null}

        {images.length > 0 ? (
          <div className="desktop-agent-chat__composer-images">
            {images.map((image) => (
              <div key={image.id} className="desktop-agent-chat__composer-image">
                {image.dataBase64 ? (
                  <img
                    src={`data:${image.mimeType};base64,${image.dataBase64}`}
                    alt={image.name}
                  />
                ) : (
                  <span>{image.name}</span>
                )}
                <button
                  type="button"
                  className="desktop-agent-chat__composer-image-remove"
                  aria-label={`Remove ${image.name}`}
                  onClick={() => removeImage(image.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="desktop-agent-chat__input-row">
          <ComposerPromptEditor
            editorRef={editorRef}
            value={value}
            disabled={disabled}
            placeholder={placeholder}
            onChange={handleEditorChange}
            onCommandKeyDown={handleCommandKeyDown}
            onEscape={handleEscape}
            onSubmitEnter={handleSubmitEnter}
          />
        </div>
        <div className="desktop-agent-chat__composer-toolbar">
          <div className="desktop-agent-chat__composer-toolbar-start">
            <DesktopAgentModelPicker
              disabled={disabled}
              onModelChange={onModelChange}
            />
            <DesktopAgentModePicker
              disabled={disabled}
              value={mode}
              onModeChange={onModeChange}
            />
          </div>
          <div className="desktop-agent-chat__composer-toolbar-end">
            {/* T3: one primary action — Stop while running, Send when idle. */}
            {running && onCancel ? (
              <button
                type="button"
                className="desktop-agent-chat__send desktop-agent-chat__send--stop"
                onMouseDown={(event) => {
                  // Keep the contenteditable from stealing focus before click fires.
                  event.preventDefault();
                }}
                onClick={onCancel}
                aria-label="Stop generation"
                title="Stop"
              >
                <ComposerStopIcon />
              </button>
            ) : (
              <button
                type="button"
                className="desktop-agent-chat__send"
                onClick={handleSendClick}
                disabled={!canSend && value.trim() !== "/clear"}
                aria-label="Send message"
                title="Send"
              >
                <ComposerSendIcon />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

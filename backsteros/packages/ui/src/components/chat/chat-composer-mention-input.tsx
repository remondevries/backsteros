"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import {
  deleteComposerMentionChipBeforeCaret,
  getComposerSerializedCaretOffset,
  insertComposerMentionChipAtSelection,
  insertPlainTextAtComposerCaret,
  renderComposerMentionDoc,
  serializeComposerEditorRoot,
  setComposerSerializedCaretOffset,
} from "../../chat/chat-composer-mention-editor.js";
import {
  computePlainTextMentionTrigger,
  insertMentionItemAtTrigger,
} from "../../chat/chat-composer-mentions.js";
import type { MentionCatalog, MentionItem } from "../../mentions/mention-menu-types.js";

export type ChatComposerMentionInputProps = {
  value: string;
  onValueChange: (next: string) => void;
  onCaretChange: (offset: number) => void;
  catalog: MentionCatalog;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  onPasteImages?: (event: ClipboardEvent<HTMLDivElement>) => boolean;
  /** Called when Enter should send (no shift, menu closed handled by parent). */
  onSubmit?: () => void;
  children?: ReactNode;
};

/**
 * Contenteditable chat composer with atomic mention chips.
 * Serialized value is always plain text with `[@kind:…]` tokens.
 */
export function ChatComposerMentionInput({
  value,
  onValueChange,
  onCaretChange,
  catalog,
  disabled = false,
  placeholder = "Message…",
  className,
  onKeyDown,
  onPasteImages,
  onSubmit,
}: ChatComposerMentionInputProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const lastValueRef = useRef(value);
  const composingRef = useRef(false);

  const syncFromValue = useCallback(
    (next: string, caret?: number) => {
      const root = rootRef.current;
      if (!root) return;
      renderComposerMentionDoc(root, next, catalog);
      lastValueRef.current = next;
      if (caret != null) {
        setComposerSerializedCaretOffset(root, caret);
        onCaretChange(caret);
      }
    },
    [catalog, onCaretChange],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (!root.dataset.ready) {
      syncFromValue(value, value.length);
      root.dataset.ready = "1";
      return;
    }
    if (value === lastValueRef.current) return;
    const caret = getComposerSerializedCaretOffset(root);
    syncFromValue(value, Math.min(caret, value.length));
  }, [syncFromValue, value]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const empty = serializeComposerEditorRoot(root).length === 0;
    root.dataset.empty = empty ? "true" : "false";
  }, [value]);

  const emitFromDom = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const serialized = serializeComposerEditorRoot(root);
    lastValueRef.current = serialized;
    onValueChange(serialized);
    onCaretChange(getComposerSerializedCaretOffset(root));
  }, [onCaretChange, onValueChange]);

  const handleInput = (_event: FormEvent<HTMLDivElement>) => {
    if (composingRef.current) return;
    emitFromDom();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      onKeyDown?.(event);
      return;
    }

    if (event.key === "Backspace" && !event.metaKey && !event.ctrlKey) {
      const root = rootRef.current;
      if (root && deleteComposerMentionChipBeforeCaret(root)) {
        event.preventDefault();
        emitFromDom();
        onKeyDown?.(event);
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      // Parent may preventDefault for mention/slash menus first.
      onKeyDown?.(event);
      if (event.defaultPrevented) return;
      event.preventDefault();
      onSubmit?.();
      return;
    }

    onKeyDown?.(event);
  };

  const handleKeyUp = () => {
    const root = rootRef.current;
    if (!root) return;
    onCaretChange(getComposerSerializedCaretOffset(root));
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (onPasteImages?.(event)) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    const plain = event.clipboardData.getData("text/plain");
    if (!plain) return;
    const root = rootRef.current;
    if (!root) return;
    const next = insertPlainTextAtComposerCaret(root, plain, catalog);
    lastValueRef.current = next;
    onValueChange(next);
    onCaretChange(getComposerSerializedCaretOffset(root));
  };

  const handleClick = () => {
    const root = rootRef.current;
    if (!root) return;
    onCaretChange(getComposerSerializedCaretOffset(root));
  };

  return (
    <div
      ref={rootRef}
      className={["chat-ui-composer__input", "is-mention-editor", className]
        .filter(Boolean)
        .join(" ")}
      role="textbox"
      aria-multiline="true"
      aria-placeholder={placeholder}
      data-placeholder={placeholder}
      contentEditable={!disabled}
      suppressContentEditableWarning
      spellCheck
      data-disabled={disabled ? "true" : undefined}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onPaste={handlePaste}
      onClick={handleClick}
      onSelect={handleClick}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={() => {
        composingRef.current = false;
        emitFromDom();
      }}
    />
  );
}

/** Imperative helpers used when picking from the mention menu. */
export function applyMentionItemToComposerInput(
  root: HTMLElement,
  value: string,
  cursor: number,
  item: MentionItem,
  catalog: MentionCatalog,
): { text: string; cursor: number } | null {
  const trigger = computePlainTextMentionTrigger(value, cursor);
  if (!trigger) return null;

  // Prefer DOM chip insert when caret is live in this root.
  const liveCaret = getComposerSerializedCaretOffset(root);
  const triggerLen = trigger.to - trigger.from;
  if (Math.abs(liveCaret - cursor) <= 1) {
    const { token, label } = insertMentionItemAtTrigger(value, trigger, item);
    const kind = item.kind;
    const next = insertComposerMentionChipAtSelection(
      root,
      token,
      label,
      kind,
      triggerLen,
    );
    return { text: next, cursor: getComposerSerializedCaretOffset(root) };
  }

  const result = insertMentionItemAtTrigger(value, trigger, item);
  renderComposerMentionDoc(root, result.text, catalog);
  setComposerSerializedCaretOffset(root, result.cursor);
  return { text: result.text, cursor: result.cursor };
}

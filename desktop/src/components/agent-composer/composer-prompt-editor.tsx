/**
 * Lexical prompt editor with file-mention chips.
 * Adapted from pingdotgg/t3code (MIT) ComposerPromptEditor — mentions only.
 */

import { LexicalComposer, type InitialConfigType } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_TAB_COMMAND,
  type EditorState,
  type ElementNode,
  type LexicalNode,
} from "lexical";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";

import { AGENT_CHAT_COMPOSER_FOCUS_ATTR } from "./composer-focus-attr";
import {
  clampCollapsedComposerCursor,
  collapseExpandedComposerCursor,
} from "./composer-logic";
import {
  $createComposerMentionNode,
  $isComposerMentionNode,
  ComposerMentionNode,
} from "./composer-mention-node";
import { splitPromptIntoComposerSegments } from "./composer-mentions";

/** Match t3code ContentEditable `max-h-50` (12.5rem) / `min-h-17.5` (4.375rem). */
const COMPOSER_EDITOR_MIN_HEIGHT_PX = 70;
const COMPOSER_EDITOR_MAX_HEIGHT_PX = 200;

export type ComposerPromptEditorHandle = {
  focus: () => void;
  blur: () => void;
  isFocused: () => boolean;
  focusAtEnd: () => void;
  readSnapshot: () => { value: string; expandedCursor: number };
};

export type ComposerPromptEditorProps = {
  value: string;
  disabled?: boolean;
  placeholder?: string;
  editorRef: RefObject<ComposerPromptEditorHandle | null>;
  onChange: (nextValue: string, expandedCursor: number) => void;
  onCommandKeyDown?: (
    key: "ArrowDown" | "ArrowUp" | "Enter" | "Tab",
    event: KeyboardEvent,
  ) => boolean;
  onEscape?: () => void;
  onSubmitEnter?: () => void;
};

function $appendTextWithLineBreaks(parent: ElementNode, text: string): void {
  const parts = text.split("\n");
  for (let i = 0; i < parts.length; i += 1) {
    if (i > 0) parent.append($createLineBreakNode());
    const part = parts[i];
    if (part) parent.append($createTextNode(part));
  }
}

function $setComposerEditorPrompt(prompt: string): void {
  const root = $getRoot();
  root.clear();
  const paragraph = $createParagraphNode();
  root.append(paragraph);

  const segments = splitPromptIntoComposerSegments(prompt);
  if (segments.length === 0) {
    return;
  }
  for (const segment of segments) {
    if (segment.type === "mention") {
      paragraph.append($createComposerMentionNode(segment.path));
      continue;
    }
    $appendTextWithLineBreaks(paragraph, segment.text);
  }
}

function getComposerNodeExpandedLength(node: LexicalNode): number {
  if ($isComposerMentionNode(node)) return node.getTextContent().length;
  if ($isTextNode(node)) return node.getTextContentSize();
  if (node.getType() === "linebreak") return 1;
  if ($isElementNode(node)) {
    return node
      .getChildren()
      .reduce((sum, child) => sum + getComposerNodeExpandedLength(child), 0);
  }
  return node.getTextContent().length;
}

function $getExpandedOffset(): number {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return 0;

  const anchor = selection.anchor;
  const anchorNode = anchor.getNode();
  let offset = 0;

  const walk = (node: LexicalNode): boolean => {
    if (node === anchorNode) {
      if ($isComposerMentionNode(node)) {
        offset += anchor.offset > 0 ? node.getTextContent().length : 0;
        return true;
      }
      if ($isTextNode(node) || node.getType() === "linebreak") {
        offset += anchor.offset;
        return true;
      }
      if ($isElementNode(node)) {
        const children = node.getChildren();
        for (let i = 0; i < Math.min(anchor.offset, children.length); i += 1) {
          offset += getComposerNodeExpandedLength(children[i]!);
        }
        return true;
      }
      return true;
    }

    if ($isElementNode(node)) {
      for (const child of node.getChildren()) {
        if (walk(child)) return true;
      }
      return false;
    }

    offset += getComposerNodeExpandedLength(node);
    return false;
  };

  walk($getRoot());
  return offset;
}

function $placeSelectionOnNode(node: LexicalNode, offset: number): void {
  const sel = $createRangeSelection();
  const type = $isTextNode(node) ? "text" : "element";
  sel.anchor.set(node.getKey(), offset, type);
  sel.focus.set(node.getKey(), offset, type);
  $setSelection(sel);
}

function $placeSelectionOnParent(node: LexicalNode, index: number): boolean {
  const parent = node.getParent();
  if (!parent) return false;
  const sel = $createRangeSelection();
  sel.anchor.set(parent.getKey(), index, "element");
  sel.focus.set(parent.getKey(), index, "element");
  $setSelection(sel);
  return true;
}

function $setSelectionAtCollapsedOffset(targetOffset: number): void {
  const root = $getRoot();
  let remaining = Math.max(0, targetOffset);

  const visit = (node: LexicalNode): boolean => {
    if ($isComposerMentionNode(node)) {
      if (remaining === 0) {
        if ($placeSelectionOnParent(node, node.getIndexWithinParent())) {
          return true;
        }
        $placeSelectionOnNode(node, 0);
        return true;
      }
      if (remaining <= 1) {
        if ($placeSelectionOnParent(node, node.getIndexWithinParent() + 1)) {
          return true;
        }
        $placeSelectionOnNode(node, 1);
        return true;
      }
      remaining -= 1;
      return false;
    }

    if ($isTextNode(node)) {
      const size = node.getTextContentSize();
      if (remaining <= size) {
        $placeSelectionOnNode(node, remaining);
        return true;
      }
      remaining -= size;
      return false;
    }

    if (node.getType() === "linebreak") {
      if (remaining === 0) {
        $placeSelectionOnNode(node, 0);
        return true;
      }
      if (remaining <= 1) {
        if ($placeSelectionOnParent(node, node.getIndexWithinParent() + 1)) {
          return true;
        }
      }
      remaining -= 1;
      return false;
    }

    if ($isElementNode(node)) {
      for (const child of node.getChildren()) {
        if (visit(child)) return true;
      }
    }
    return false;
  };

  if (!visit(root)) {
    root.selectEnd();
  }
}

function resizeComposerEditable(el: HTMLElement, isEmpty: boolean): void {
  if (isEmpty) {
    el.style.height = `${COMPOSER_EDITOR_MIN_HEIGHT_PX}px`;
    el.style.overflowY = "hidden";
    return;
  }
  el.style.height = "auto";
  const next = Math.min(
    Math.max(el.scrollHeight, COMPOSER_EDITOR_MIN_HEIGHT_PX),
    COMPOSER_EDITOR_MAX_HEIGHT_PX,
  );
  el.style.height = `${next}px`;
  el.style.overflowY =
    el.scrollHeight > COMPOSER_EDITOR_MAX_HEIGHT_PX ? "auto" : "hidden";
}

function ComposerCommandKeyPlugin(props: {
  onCommandKeyDown?: (
    key: "ArrowDown" | "ArrowUp" | "Enter" | "Tab",
    event: KeyboardEvent,
  ) => boolean;
  onEscape?: () => void;
  onSubmitEnter?: () => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const handleCommand = (
      key: "ArrowDown" | "ArrowUp" | "Enter" | "Tab",
      event: KeyboardEvent | null,
    ): boolean => {
      if (!event) return false;
      if (props.onCommandKeyDown?.(key, event)) {
        event.preventDefault();
        return true;
      }
      if (key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        props.onSubmitEnter?.();
        return true;
      }
      return false;
    };

    const unregister = [
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        (event) => handleCommand("ArrowDown", event),
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        (event) => handleCommand("ArrowUp", event),
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => handleCommand("Enter", event),
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_TAB_COMMAND,
        (event) => handleCommand("Tab", event),
        COMMAND_PRIORITY_HIGH,
      ),
    ];

    const root = editor.getRootElement();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        props.onEscape?.();
      }
    };
    root?.addEventListener("keydown", onKeyDown);

    return () => {
      for (const u of unregister) u();
      root?.removeEventListener("keydown", onKeyDown);
    };
  }, [editor, props]);

  return null;
}

function ComposerPromptEditorInner({
  value,
  disabled = false,
  placeholder = "Message the agent…",
  editorRef,
  onChange,
  onCommandKeyDown,
  onEscape,
  onSubmitEnter,
}: ComposerPromptEditorProps) {
  const [editor] = useLexicalComposerContext();
  const onChangeRef = useRef(onChange);
  const snapshotRef = useRef({
    value,
    expandedCursor: value.length,
  });
  const isApplyingControlledUpdateRef = useRef(false);
  const editableRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useLayoutEffect(() => {
    const previous = snapshotRef.current.value;
    if (previous === value) return;

    snapshotRef.current = {
      value,
      expandedCursor: value.length,
    };

    isApplyingControlledUpdateRef.current = true;
    editor.update(() => {
      $setComposerEditorPrompt(value);
      const collapsed = collapseExpandedComposerCursor(value, value.length);
      $setSelectionAtCollapsedOffset(clampCollapsedComposerCursor(value, collapsed));
    });
    queueMicrotask(() => {
      isApplyingControlledUpdateRef.current = false;
    });
  }, [editor, value]);

  useLayoutEffect(() => {
    const el = editableRef.current;
    if (!el) return;
    resizeComposerEditable(el, value.trim().length === 0);
  }, [value]);

  const focusAt = useCallback(
    (nextCollapsed: number) => {
      const rootElement = editor.getRootElement();
      if (!rootElement) return;
      const bounded = clampCollapsedComposerCursor(
        snapshotRef.current.value,
        nextCollapsed,
      );
      rootElement.focus({ preventScroll: true });
      editor.update(() => {
        $setSelectionAtCollapsedOffset(bounded);
      });
    },
    [editor],
  );

  const readSnapshot = useCallback(() => {
    let snapshot = snapshotRef.current;
    editor.getEditorState().read(() => {
      const nextValue = $getRoot().getTextContent();
      const expandedCursor = $getExpandedOffset();
      snapshot = { value: nextValue, expandedCursor };
    });
    snapshotRef.current = snapshot;
    return snapshot;
  }, [editor]);

  useImperativeHandle(
    editorRef,
    () => ({
      focus: () => {
        focusAt(
          collapseExpandedComposerCursor(
            snapshotRef.current.value,
            snapshotRef.current.expandedCursor,
          ),
        );
      },
      blur: () => {
        editor.getRootElement()?.blur();
      },
      isFocused: () => {
        const root = editor.getRootElement();
        return Boolean(root && document.activeElement === root);
      },
      focusAtEnd: () => {
        focusAt(
          collapseExpandedComposerCursor(
            snapshotRef.current.value,
            snapshotRef.current.value.length,
          ),
        );
      },
      readSnapshot,
    }),
    [editor, focusAt, readSnapshot],
  );

  const handleEditorChange = useCallback((editorState: EditorState) => {
    editorState.read(() => {
      if (isApplyingControlledUpdateRef.current) return;
      const nextValue = $getRoot().getTextContent();
      const expandedCursor = $getExpandedOffset();
      const previous = snapshotRef.current;
      if (
        previous.value === nextValue &&
        previous.expandedCursor === expandedCursor
      ) {
        return;
      }
      snapshotRef.current = { value: nextValue, expandedCursor };
      onChangeRef.current(nextValue, expandedCursor);
    });
  }, []);

  const isIdle = value.trim().length === 0;

  return (
    <div className="desktop-agent-chat__editor-wrap">
      <PlainTextPlugin
        contentEditable={
          <ContentEditable
            ref={(node) => {
              editableRef.current = node;
            }}
            className={[
              "desktop-agent-chat__textarea",
              "desktop-agent-chat__editor",
              isIdle ? "desktop-agent-chat__textarea--idle" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label="Message the agent"
            aria-placeholder={placeholder}
            placeholder={
              <div className="desktop-agent-chat__editor-placeholder" aria-hidden>
                {disabled ? "" : placeholder}
              </div>
            }
            {...{ [AGENT_CHAT_COMPOSER_FOCUS_ATTR]: "composer" }}
          />
        }
        placeholder={
          <div className="desktop-agent-chat__editor-placeholder" aria-hidden>
            {disabled ? "" : placeholder}
          </div>
        }
        ErrorBoundary={LexicalErrorBoundary}
      />
      <OnChangePlugin onChange={handleEditorChange} />
      <ComposerCommandKeyPlugin
        onCommandKeyDown={onCommandKeyDown}
        onEscape={onEscape}
        onSubmitEnter={onSubmitEnter}
      />
      <HistoryPlugin />
    </div>
  );
}

export function ComposerPromptEditor(props: ComposerPromptEditorProps) {
  const initialValueRef = useRef(props.value);
  const initialConfig = useMemo<InitialConfigType>(
    () => ({
      namespace: "backsteros-agent-composer",
      editable: true,
      nodes: [ComposerMentionNode],
      editorState: () => {
        $setComposerEditorPrompt(initialValueRef.current);
      },
      onError: (error) => {
        console.error("[agent-composer]", error);
      },
    }),
    [],
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <ComposerPromptEditorInner {...props} />
    </LexicalComposer>
  );
}

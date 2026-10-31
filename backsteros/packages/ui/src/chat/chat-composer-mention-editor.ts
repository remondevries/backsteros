/**
 * Contenteditable helpers for atomic mention chips in the chat composer.
 * Chips are `contenteditable=false` nodes; serialization uses data-mention-token.
 */
import {
  parseComposerMentionDoc,
  serializeComposerMentionDoc,
  type ComposerMentionSegment,
} from "./chat-composer-mentions.js";
import type { MentionCatalog } from "../mentions/mention-menu-types.js";
import {
  parseMentionToken,
  type MentionKind,
} from "../mentions/mention-tokens.js";

export const COMPOSER_MENTION_CHIP_ATTR = "data-mention-token";
export const COMPOSER_MENTION_KIND_ATTR = "data-mention-kind";
export const COMPOSER_MENTION_LABEL_ATTR = "data-mention-label";

export function isComposerMentionChip(node: Node | null): node is HTMLElement {
  return (
    node instanceof HTMLElement &&
    node.hasAttribute(COMPOSER_MENTION_CHIP_ATTR)
  );
}

export function createComposerMentionChipElement(
  doc: Document,
  raw: string,
  label: string,
  kind: MentionKind,
): HTMLElement {
  const chip = doc.createElement("span");
  chip.className = "chat-ui-composer__mention-chip";
  chip.setAttribute(COMPOSER_MENTION_CHIP_ATTR, raw);
  chip.setAttribute(COMPOSER_MENTION_KIND_ATTR, kind);
  chip.setAttribute(COMPOSER_MENTION_LABEL_ATTR, label);
  chip.setAttribute("contenteditable", "false");
  chip.setAttribute("spellcheck", "false");
  chip.setAttribute("title", raw);
  chip.setAttribute("role", "inline");

  const labelEl = doc.createElement("span");
  labelEl.className = "chat-ui-composer__mention-chip-label";
  labelEl.setAttribute("spellcheck", "false");
  labelEl.textContent = label;
  chip.appendChild(labelEl);
  return chip;
}

function appendTextPreservingWhitespace(
  parent: HTMLElement,
  text: string,
  doc: Document,
): void {
  if (!text) return;
  parent.appendChild(doc.createTextNode(text));
}

/** Rebuild the contenteditable DOM from a serialized composer value. */
export function renderComposerMentionDoc(
  root: HTMLElement,
  text: string,
  catalog?: MentionCatalog | null,
): void {
  const doc = root.ownerDocument;
  const segments = parseComposerMentionDoc(text, catalog);
  root.replaceChildren();
  for (const segment of segments) {
    if (segment.type === "text") {
      appendTextPreservingWhitespace(root, segment.text, doc);
      continue;
    }
    root.appendChild(
      createComposerMentionChipElement(
        doc,
        segment.raw,
        segment.label,
        segment.token.kind,
      ),
    );
  }
  // Keep a trailing ZWSP so the caret can sit after a final chip.
  if (
    root.lastChild &&
    isComposerMentionChip(root.lastChild) &&
    !text.endsWith(" ")
  ) {
    root.appendChild(doc.createTextNode("\u200b"));
  }
  if (!root.firstChild) {
    root.appendChild(doc.createTextNode(""));
  }
}

/** Walk the editor DOM into model segments (chips → tokens, text preserved). */
export function readComposerMentionDoc(
  root: HTMLElement,
): ComposerMentionSegment[] {
  const out: ComposerMentionSegment[] = [];
  const pushText = (value: string) => {
    if (!value) return;
    const last = out[out.length - 1];
    if (last?.type === "text") {
      last.text += value;
      return;
    }
    out.push({ type: "text", text: value });
  };

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      // Strip ZWSP caret anchors; keep real spaces/newlines.
      pushText((node.nodeValue ?? "").replace(/\u200b/g, ""));
      return;
    }
    if (isComposerMentionChip(node)) {
      const raw = node.getAttribute(COMPOSER_MENTION_CHIP_ATTR) ?? "";
      const token = parseMentionToken(raw);
      const label =
        node.getAttribute(COMPOSER_MENTION_LABEL_ATTR) ??
        node.textContent?.trim() ??
        raw;
      if (token) {
        out.push({ type: "mention", token, raw, label });
      } else {
        pushText(raw || (node.textContent ?? ""));
      }
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.tagName === "BR") {
        pushText("\n");
        return;
      }
      for (const child of el.childNodes) walk(child);
      // Block-ish divs from paste often need a newline between blocks.
      if (
        (el.tagName === "DIV" || el.tagName === "P") &&
        el !== root &&
        el.nextSibling
      ) {
        pushText("\n");
      }
    }
  };

  for (const child of root.childNodes) walk(child);
  return out.length > 0 ? out : [{ type: "text", text: "" }];
}

/**
 * Normalize a serialized editor value: browsers often leave a lone `<br>` /
 * ZWSP in an "empty" contenteditable — treat that as "".
 */
export function normalizeComposerEditorSerialized(text: string): string {
  if (!text) return "";
  if (/^[\u200b\n\r]*$/.test(text)) return "";
  return text;
}

export function serializeComposerEditorRoot(root: HTMLElement): string {
  return normalizeComposerEditorSerialized(
    serializeComposerMentionDoc(readComposerMentionDoc(root)),
  );
}

/** Clear browser chrome (`<br>`, ZWSP) so an empty editor stays empty. */
export function ensureComposerEditorEmptyDom(root: HTMLElement): void {
  if (serializeComposerEditorRoot(root) !== "") return;
  root.replaceChildren();
}

/** Serialized caret offset (mention chips count as their raw token length). */
export function getComposerSerializedCaretOffset(root: HTMLElement): number {
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return serializeComposerEditorRoot(root).length;
  }
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) {
    return serializeComposerEditorRoot(root).length;
  }

  let offset = 0;
  const endNode = range.startContainer;
  const endOffset = range.startOffset;

  const visit = (node: Node): boolean => {
    if (node === endNode) {
      if (node.nodeType === Node.TEXT_NODE) {
        const value = (node.nodeValue ?? "").replace(/\u200b/g, "");
        // Approximate: if ZWSP was stripped, clamp.
        offset += Math.min(endOffset, value.length);
        return true;
      }
      // Caret inside element: count children before endOffset.
      for (let i = 0; i < endOffset; i += 1) {
        const child = node.childNodes[i];
        if (child) offset += nodeSerializedLength(child);
      }
      return true;
    }

    if (isComposerMentionChip(node)) {
      offset += (node.getAttribute(COMPOSER_MENTION_CHIP_ATTR) ?? "").length;
      return false;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      offset += (node.nodeValue ?? "").replace(/\u200b/g, "").length;
      return false;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      if ((node as HTMLElement).tagName === "BR") {
        offset += 1;
        return false;
      }
      for (const child of node.childNodes) {
        if (visit(child)) return true;
      }
    }
    return false;
  };

  for (const child of root.childNodes) {
    if (visit(child)) break;
  }
  return offset;
}

function nodeSerializedLength(node: Node): number {
  if (isComposerMentionChip(node)) {
    return (node.getAttribute(COMPOSER_MENTION_CHIP_ATTR) ?? "").length;
  }
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.nodeValue ?? "").replace(/\u200b/g, "").length;
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    if ((node as HTMLElement).tagName === "BR") return 1;
    let total = 0;
    for (const child of node.childNodes) total += nodeSerializedLength(child);
    return total;
  }
  return 0;
}

/** Place the caret at a serialized offset inside the editor. */
export function setComposerSerializedCaretOffset(
  root: HTMLElement,
  target: number,
): void {
  const doc = root.ownerDocument;
  const selection = doc.getSelection();
  if (!selection) return;

  let remaining = Math.max(0, target);
  let placed = false;

  const placeInText = (textNode: Text, localOffset: number) => {
    const range = doc.createRange();
    const len = textNode.nodeValue?.length ?? 0;
    range.setStart(textNode, Math.max(0, Math.min(localOffset, len)));
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    placed = true;
  };

  const visit = (node: Node): boolean => {
    if (isComposerMentionChip(node)) {
      const len = (node.getAttribute(COMPOSER_MENTION_CHIP_ATTR) ?? "").length;
      if (remaining <= len) {
        // Land just after the chip.
        const range = doc.createRange();
        range.setStartAfter(node);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        placed = true;
        return true;
      }
      remaining -= len;
      return false;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      const raw = node.nodeValue ?? "";
      const visible = raw.replace(/\u200b/g, "");
      if (remaining <= visible.length) {
        // Map visible offset back into raw (ZWSP may exist).
        let visibleSeen = 0;
        let rawIndex = 0;
        while (rawIndex < raw.length && visibleSeen < remaining) {
          if (raw[rawIndex] !== "\u200b") visibleSeen += 1;
          rawIndex += 1;
        }
        placeInText(node as Text, rawIndex);
        return true;
      }
      remaining -= visible.length;
      return false;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      if ((node as HTMLElement).tagName === "BR") {
        if (remaining <= 1) {
          const range = doc.createRange();
          range.setStartAfter(node);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
          placed = true;
          return true;
        }
        remaining -= 1;
        return false;
      }
      for (const child of node.childNodes) {
        if (visit(child)) return true;
      }
    }
    return false;
  };

  for (const child of root.childNodes) {
    if (visit(child)) break;
  }

  if (!placed) {
    const range = doc.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

/**
 * Insert a mention chip at the current selection, replacing `triggerLen`
 * characters before the caret (the `@query` span). Always adds a trailing space.
 */
export function insertComposerMentionChipAtSelection(
  root: HTMLElement,
  raw: string,
  label: string,
  kind: MentionKind,
  triggerLen: number,
): string {
  const doc = root.ownerDocument;
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) {
    root.appendChild(createComposerMentionChipElement(doc, raw, label, kind));
    root.appendChild(doc.createTextNode(" "));
    return serializeComposerEditorRoot(root);
  }

  const range = selection.getRangeAt(0);
  range.collapse(true);

  // Delete the @query characters before the caret.
  if (triggerLen > 0) {
    const del = doc.createRange();
    del.setStart(range.startContainer, range.startOffset);
    del.collapse(true);
    // Expand backward within the same text node when possible.
    if (
      range.startContainer.nodeType === Node.TEXT_NODE &&
      range.startOffset >= triggerLen
    ) {
      del.setStart(range.startContainer, range.startOffset - triggerLen);
      del.setEnd(range.startContainer, range.startOffset);
      del.deleteContents();
    } else {
      // Fallback: rebuild from serialized text with caret math is handled by callers.
      const serialized = serializeComposerEditorRoot(root);
      const caret = getComposerSerializedCaretOffset(root);
      const from = Math.max(0, caret - triggerLen);
      const next = `${serialized.slice(0, from)}${raw} ${serialized.slice(caret)}`;
      renderComposerMentionDoc(root, next);
      setComposerSerializedCaretOffset(root, from + raw.length + 1);
      return next;
    }
  }

  const chip = createComposerMentionChipElement(doc, raw, label, kind);
  const space = doc.createTextNode(" ");
  const insertAt = selection.getRangeAt(0);
  insertAt.collapse(true);
  insertAt.insertNode(space);
  insertAt.insertNode(chip);
  // Caret after the trailing space.
  const after = doc.createRange();
  after.setStart(space, space.length);
  after.collapse(true);
  selection.removeAllRanges();
  selection.addRange(after);

  return serializeComposerEditorRoot(root);
}

/** Delete the chip immediately before a collapsed caret, if any. */
export function deleteComposerMentionChipBeforeCaret(root: HTMLElement): boolean {
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
    return false;
  }
  const range = selection.getRangeAt(0);
  const { startContainer, startOffset } = range;

  let chip: Node | null = null;
  if (startContainer.nodeType === Node.TEXT_NODE && startOffset === 0) {
    chip = startContainer.previousSibling;
  } else if (startContainer === root && startOffset > 0) {
    chip = root.childNodes[startOffset - 1] ?? null;
  } else if (
    startContainer.nodeType === Node.TEXT_NODE &&
    startOffset > 0 &&
    (startContainer.nodeValue ?? "").slice(0, startOffset).replace(/\u200b/g, "") ===
      ""
  ) {
    chip = startContainer.previousSibling;
  }

  if (!isComposerMentionChip(chip)) return false;
  const after = chip.nextSibling;
  chip.parentNode?.removeChild(chip);
  const next = root.ownerDocument.createRange();
  if (after) {
    if (after.nodeType === Node.TEXT_NODE) {
      next.setStart(after, 0);
    } else {
      next.setStartBefore(after);
    }
  } else {
    next.selectNodeContents(root);
    next.collapse(false);
  }
  next.collapse(true);
  selection.removeAllRanges();
  selection.addRange(next);
  return true;
}

/** Insert plain text at the caret (paste). Mentions in the paste become chips. */
export function insertPlainTextAtComposerCaret(
  root: HTMLElement,
  plain: string,
  catalog?: MentionCatalog | null,
): string {
  const doc = root.ownerDocument;
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) {
    const serialized = serializeComposerEditorRoot(root) + plain;
    renderComposerMentionDoc(root, serialized, catalog);
    setComposerSerializedCaretOffset(root, serialized.length);
    return serialized;
  }

  const range = selection.getRangeAt(0);
  range.deleteContents();

  const fragment = doc.createDocumentFragment();
  const segments = parseComposerMentionDoc(plain, catalog);
  let lastText: Text | null = null;
  for (const segment of segments) {
    if (segment.type === "text") {
      lastText = doc.createTextNode(segment.text);
      fragment.appendChild(lastText);
      continue;
    }
    fragment.appendChild(
      createComposerMentionChipElement(
        doc,
        segment.raw,
        segment.label,
        segment.token.kind,
      ),
    );
    lastText = null;
  }
  range.insertNode(fragment);

  const after = doc.createRange();
  if (lastText) {
    after.setStart(lastText, lastText.length);
  } else {
    after.selectNodeContents(root);
    after.collapse(false);
  }
  after.collapse(true);
  selection.removeAllRanges();
  selection.addRange(after);

  return serializeComposerEditorRoot(root);
}

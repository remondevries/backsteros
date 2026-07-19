import type { EditorView } from "@codemirror/view";

import type { MentionMenuTriggerState } from "../mention-menu-types.js";

const MENTION_TRIGGER_RE = /(?:^|\s)@([^\s@]{0,60})$/;

export function computeMentionTriggerState(
  view: EditorView,
): MentionMenuTriggerState | null {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return null;
  }

  const pos = selection.head;
  const line = view.state.doc.lineAt(pos);
  const before = line.text.slice(0, pos - line.from);
  const match = MENTION_TRIGGER_RE.exec(before);
  if (!match) {
    return null;
  }

  const atOffset = match.index + match[0].length - match[1]!.length - 1;
  const from = line.from + atOffset;
  const to = pos;
  const query = match[1]!;

  return { from, to, query };
}

import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

/**
 * Leading whitespace + list marker (+ optional GFM task checkbox) + trailing
 * space. Used for soft-wrap hang indent so wrapped text lines up under the
 * item body rather than flushing under the bullet.
 */
export const LIST_HANG_INDENT_PREFIX =
  /^([ \t]*(?:[-*+]|\d+[.)])(?:[ \t]+\[[ xX]\])?[ \t]+)/;

export function listHangIndentColumns(lineText: string): number | null {
  const match = lineText.match(LIST_HANG_INDENT_PREFIX);
  if (!match?.[1]) return null;
  return match[1].length;
}

function buildListHangIndentDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const columns = listHangIndentColumns(line.text);
      if (columns != null && columns > 0) {
        builder.add(
          line.from,
          line.from,
          Decoration.line({
            attributes: { style: `--cm-list-hang: ${columns}ch` },
          }),
        );
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

const listHangIndentPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildListHangIndentDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildListHangIndentDecorations(update.view);
      }
    }
  },
  { decorations: (value) => value.decorations },
);

/**
 * Soft-wrapped list lines keep a hanging indent under the text after `-` /
 * `1.` so the list layout remains readable in edit mode.
 */
export const documentEditorListHangIndent = [
  listHangIndentPlugin,
  EditorView.theme({
    ".cm-line": {
      paddingInlineStart: "var(--cm-list-hang, 0px)",
      textIndent: "calc(-1 * var(--cm-list-hang, 0px))",
    },
  }),
];

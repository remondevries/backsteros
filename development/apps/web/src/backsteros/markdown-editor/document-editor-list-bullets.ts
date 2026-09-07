import { syntaxTree } from "@codemirror/language";
import { type EditorState, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";

/** Matches preview `ul { padding-left: 1.35em }` gutter for the disc. */
export const LIST_BULLET_GUTTER = "1.35em";

const UNORDERED_LIST_MARK = /^[-*+]$/;

export function isUnorderedListMark(text: string): boolean {
  return UNORDERED_LIST_MARK.test(text);
}

/** GFM task items keep the raw `-` — the checkbox is the list affordance. */
export function isTaskListMarkAfter(state: EditorState, markTo: number): boolean {
  const after = state.sliceDoc(markTo, Math.min(markTo + 6, state.doc.length));
  return /^\s*\[[ xX]\]/.test(after);
}

/**
 * End offset of the markdown marker run to hide: ListMark plus the spaces
 * that follow it on the same line (usually a single ` `).
 */
export function listMarkReplaceTo(state: EditorState, markFrom: number, markTo: number): number {
  const line = state.doc.lineAt(markFrom);
  let end = markTo;
  while (end < line.to) {
    const ch = state.sliceDoc(end, end + 1);
    if (ch !== " " && ch !== "\t") break;
    end += 1;
  }
  return end;
}

class ListBulletWidget extends WidgetType {
  eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.className = "cm-list-bullet";
    el.setAttribute("aria-hidden", "true");
    return el;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

const bulletWidget = new ListBulletWidget();

const listLineDeco = Decoration.line({ class: "cm-md-ul-item" });
const bulletReplaceDeco = Decoration.replace({
  widget: bulletWidget,
  inclusive: false,
});

function buildListBulletDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { state } = view;
  const seenLines = new Set<number>();

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== "ListMark") return;
        const mark = state.sliceDoc(node.from, node.to);
        if (!isUnorderedListMark(mark)) return;
        if (isTaskListMarkAfter(state, node.to)) return;

        const line = state.doc.lineAt(node.from);
        if (!seenLines.has(line.from)) {
          seenLines.add(line.from);
          builder.add(line.from, line.from, listLineDeco);
        }

        const replaceTo = listMarkReplaceTo(state, node.from, node.to);
        builder.add(node.from, replaceTo, bulletReplaceDeco);
      },
    });
  }

  return builder.finish();
}

const listBulletPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildListBulletDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildListBulletDecorations(update.view);
      }
    }
  },
  {
    decorations: (value) => value.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => {
        const deco = view.plugin(plugin)?.decorations;
        if (!deco) return Decoration.none;
        return deco.update({
          filter: (_from, _to, value) => value.spec.widget != null,
        });
      }),
  },
);

/**
 * Preview-parity unordered lists in the markdown editor:
 * disc in a left gutter. Markers stay replaced by the bullet widget so caret
 * moves do not wiggle line layout.
 */
export const documentEditorListBullets = [
  listBulletPlugin,
  EditorView.theme({
    ".cm-md-ul-item": {
      position: "relative",
      paddingLeft: LIST_BULLET_GUTTER,
      textIndent: "0",
    },
    ".cm-list-bullet": {
      position: "absolute",
      left: "0",
      top: "0",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: LIST_BULLET_GUTTER,
      height: "1.75em",
      boxSizing: "border-box",
      color: "color-mix(in srgb, var(--foreground) 85%, transparent)",
      lineHeight: "inherit",
      pointerEvents: "auto",
      userSelect: "none",
    },
    ".cm-list-bullet::before": {
      content: '""',
      display: "block",
      width: "0.34em",
      height: "0.34em",
      borderRadius: "999px",
      backgroundColor: "currentColor",
    },
  }),
];

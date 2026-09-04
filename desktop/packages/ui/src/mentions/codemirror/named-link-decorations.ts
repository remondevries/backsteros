import {
  type EditorState,
  RangeSetBuilder,
  type Extension,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";

import { isCursorInRange } from "../../documents/document-editor-list-bullets.js";
import {
  faviconHostForNamedLinkUrl,
  parseNamedLinkToken,
  type ParsedNamedLinkToken,
} from "../named-link-tokens.js";

/** EmailNavIcon path (sidebar-nav-icons) — inlined for CodeMirror widgets. */
const EMAIL_ICON_PATH =
  "M14.9341 1.65742L10.0527 14.5271C9.85398 15.0514 9.36691 15.1558 8.97104 14.7594C8.97104 14.7594 5.89577 11.6842 5.61555 11.4039C5.33533 11.1237 5.43264 10.573 5.83208 10.1796L12.6164 3.50024C13.0159 3.10692 12.9787 3.06412 12.5334 3.40497L4.89564 9.25594C4.45086 9.59678 3.76254 9.55144 3.36615 9.15506L1.24057 7.02947C0.844185 6.63309 0.94863 6.14653 1.47289 5.94732L14.3426 1.0659C14.8668 0.867203 15.1328 1.13316 14.9341 1.65742ZM3.93729 10.4466C3.7391 10.2484 3.57708 10.3157 3.57708 10.5959V12.9324C3.57708 13.2126 3.77375 13.3237 4.01371 13.1795L5.237 12.4453C5.47748 12.3012 5.51161 12.0209 5.31342 11.8227L3.93729 10.4466Z";

const LINK_ICON_PATH =
  "m7.775 3.275 1.25-1.25a3.5 3.5 0 1 1 4.95 4.95l-2.5 2.5a3.5 3.5 0 0 1-4.95 0 .751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018 1.998 1.998 0 0 0 2.83 0l2.5-2.5a2.002 2.002 0 0 0-2.83-2.83l-1.25 1.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042Zm-4.69 9.64a1.998 1.998 0 0 0 2.83 0l1.25-1.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042l-1.25 1.25a3.5 3.5 0 1 1-4.95-4.95l2.5-2.5a3.5 3.5 0 0 1 4.95 0 .751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018 1.998 1.998 0 0 0-2.83 0l-2.5 2.5a1.998 1.998 0 0 0 0 2.83Z";

function createSvgIcon(pathD: string, className?: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  if (className) {
    svg.setAttribute("class", className);
  }
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathD);
  path.setAttribute("fill", "currentColor");
  svg.appendChild(path);
  return svg;
}

function appendNamedLinkIcon(
  iconWrap: HTMLElement,
  token: ParsedNamedLinkToken,
): void {
  if (token.kind === "spark-email") {
    iconWrap.appendChild(createSvgIcon(EMAIL_ICON_PATH));
    return;
  }

  const host = faviconHostForNamedLinkUrl(token.url);
  if (!host) {
    iconWrap.appendChild(createSvgIcon(LINK_ICON_PATH));
    return;
  }

  const img = document.createElement("img");
  img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
  img.alt = "";
  img.width = 14;
  img.height = 14;
  img.className = "named-link-chip__favicon";
  img.addEventListener("error", () => {
    img.replaceWith(createSvgIcon(LINK_ICON_PATH));
  });
  iconWrap.appendChild(img);
}

class NamedLinkWidget extends WidgetType {
  constructor(readonly token: ParsedNamedLinkToken) {
    super();
  }

  eq(other: NamedLinkWidget): boolean {
    return (
      this.token.url === other.token.url &&
      this.token.label === other.token.label &&
      this.token.kind === other.token.kind
    );
  }

  toDOM(): HTMLElement {
    const anchor = document.createElement("a");
    anchor.href = this.token.url;
    anchor.className = [
      "mention-chip-lite",
      "mention-chip-lite--link",
      "named-link-chip",
      "cm-named-link-chip",
      this.token.kind === "spark-email" ? "named-link-chip--spark-email" : "",
    ]
      .filter(Boolean)
      .join(" ");
    anchor.title = this.token.url;
    if (/^https?:/i.test(this.token.url)) {
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
    }

    const iconWrap = document.createElement("span");
    iconWrap.className = "mention-chip-lite__icon";
    iconWrap.setAttribute("aria-hidden", "true");
    appendNamedLinkIcon(iconWrap, this.token);

    const label = document.createElement("span");
    label.className = "mention-chip-lite__label";
    label.textContent = this.token.label;

    anchor.appendChild(iconWrap);
    anchor.appendChild(label);

    anchor.addEventListener("mousedown", (event) => {
      // Keep focus/caret out of the chip; still allow click-to-open.
      event.preventDefault();
    });

    return anchor;
  }

  ignoreEvent(event: Event): boolean {
    return event.type !== "mousedown" && event.type !== "click";
  }
}

function findNamedLinkRanges(
  state: EditorState,
): Array<{ from: number; to: number; token: ParsedNamedLinkToken }> {
  const text = state.doc.toString();
  const ranges: Array<{
    from: number;
    to: number;
    token: ParsedNamedLinkToken;
  }> = [];
  const re = /\[(?!@)([^\]\|\r\n]+)\|([^\]\r\n]+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) != null) {
    const raw = match[0];
    const token = parseNamedLinkToken(raw);
    if (!token) continue;
    const from = match.index;
    const to = from + raw.length;
    ranges.push({ from, to, token });
  }
  return ranges;
}

function buildNamedLinkDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { state } = view;

  for (const range of findNamedLinkRanges(state)) {
    if (isCursorInRange(state, range.from, range.to)) {
      continue;
    }
    builder.add(
      range.from,
      range.to,
      Decoration.replace({
        widget: new NamedLinkWidget(range.token),
        inclusive: false,
      }),
    );
  }

  return builder.finish();
}

const namedLinkPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildNamedLinkDecorations(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet
      ) {
        this.decorations = buildNamedLinkDecorations(update.view);
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

/** CodeMirror widgets for `[url|label]` named links (preview-parity chips). */
export const namedLinkDecorations: Extension[] = [namedLinkPlugin];

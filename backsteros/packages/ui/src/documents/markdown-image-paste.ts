import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export type UploadMarkdownImages = (
  files: File[],
) => Promise<string[] | null | undefined>;

/** Collect image files from a paste or drop DataTransfer. */
export function collectImageFiles(
  data: DataTransfer | null | undefined,
): File[] {
  if (!data) return [];
  return [...(data.files ?? [])].filter((file) =>
    file.type.startsWith("image/"),
  );
}

/** Build a markdown image line for an uploaded content URL. */
export function markdownImageSnippet(
  url: string,
  alt = "screenshot",
): string {
  const safeAlt = alt.replace(/[[\]]/g, "").trim() || "screenshot";
  return `![${safeAlt}](${url})`;
}

function insertTextAtCursor(view: EditorView, text: string): void {
  const { from, to } = view.state.selection.main;
  const needsLeadingNewline =
    from > 0 && view.state.doc.sliceString(from - 1, from) !== "\n";
  const needsTrailingNewline =
    to < view.state.doc.length &&
    view.state.doc.sliceString(to, to + 1) !== "\n";
  const insert = `${needsLeadingNewline ? "\n" : ""}${text}${
    needsTrailingNewline ? "\n" : ""
  }`;
  view.dispatch({
    changes: { from, to, insert },
    selection: {
      anchor: from + insert.length,
    },
    scrollIntoView: true,
  });
}

/**
 * Paste / drop image files when `getUpload` returns a handler.
 * Inserts `![screenshot](url)` for each uploaded URL.
 */
export function createMarkdownImagePasteExtensions(
  getUpload: () => UploadMarkdownImages | undefined,
): Extension[] {
  let busy = false;

  const handleFiles = (view: EditorView, files: File[]): boolean => {
    const upload = getUpload();
    if (!upload || files.length === 0 || busy) return false;
    busy = true;
    void (async () => {
      try {
        const urls = await upload(files);
        if (!urls?.length) return;
        const block = urls
          .map((url) => markdownImageSnippet(url))
          .join("\n");
        insertTextAtCursor(view, block);
        view.focus();
      } finally {
        busy = false;
      }
    })();
    return true;
  };

  return [
    EditorView.domEventHandlers({
      paste(event, view) {
        const files = collectImageFiles(event.clipboardData);
        if (files.length === 0) return false;
        event.preventDefault();
        return handleFiles(view, files);
      },
      drop(event, view) {
        const files = collectImageFiles(event.dataTransfer);
        if (files.length === 0) return false;
        event.preventDefault();
        return handleFiles(view, files);
      },
      dragover(event) {
        if (!getUpload()) return false;
        const types = event.dataTransfer?.types;
        if (!types || ![...types].includes("Files")) return false;
        event.preventDefault();
        return true;
      },
    }),
  ];
}

import { parseMarkdownDocument, serializeMarkdownDocument } from "./frontmatter";
import { stripDuplicateDocumentTitleHeading } from "./titles";

/** Body shown in CodeMirror — frontmatter and duplicate `# title` are omitted. */
export function getDocumentEditorBody(content: string, title: string): string {
  const { body } = parseMarkdownDocument(content);
  return stripDuplicateDocumentTitleHeading(body || content, title);
}

/** Persist document body without embedding the title in the file. */
export function serializeDocumentBody(body: string): string {
  return body.replace(/^\n+/, "");
}

/** Journal entries still store their date label in frontmatter. */
export function mergeJournalContent(title: string, editorBody: string): string {
  return serializeMarkdownDocument({
    frontmatter: { title: title.trim() },
    body: editorBody,
  });
}

/** Max width for document body text in preview and edit modes. */
export const DOCUMENT_CONTENT_MAX_WIDTH = "800px";

/** Top inset above icon/title in detail views (edit header or preview column). */
export const CONTENT_DETAIL_TOP_PADDING_CLASS = "pt-8";

/** Space between title block and markdown body (preview and edit). */
export const CONTENT_DETAIL_TITLE_BODY_GAP_CLASS = "mb-6";

/** Outer article shell (max width only — padding lives on the inner column). */
export const DOCUMENT_CONTENT_ARTICLE_CLASS =
  "document-markdown mx-auto w-full min-w-0 box-border pb-14";

/** Shared horizontal padding for title + body so edit and preview align. */
export const DOCUMENT_CONTENT_INNER_CLASS =
  "document-detail-content-inner box-border w-full min-w-0 px-4";

/** Outer scroll region padding for document detail views. */
export const DOCUMENT_CONTENT_SCROLL_CLASS =
  "min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden py-4";

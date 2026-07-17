import type { ReactNode } from "react";

import {
  CONTENT_DETAIL_TITLE_BODY_GAP_CLASS,
  CONTENT_DETAIL_TOP_PADDING_CLASS,
  DOCUMENT_CONTENT_MAX_WIDTH,
} from "@/lib/documents/content-layout";

export const CONTENT_DETAIL_TITLE_CLASS =
  "text-[22px] font-semibold leading-tight text-foreground";

type ContentDetailIconTitleHeaderProps = {
  icon: ReactNode;
  title: ReactNode;
  /** When false, omit horizontal padding (e.g. inside an already padded article). */
  inlinePadding?: boolean;
  className?: string;
};

/** Icon stacked above title inside the standard detail content header shell. */
export function ContentDetailIconTitleHeader({
  icon,
  title,
  inlinePadding = true,
  className,
}: ContentDetailIconTitleHeaderProps) {
  return (
    <ContentDetailTitleHeader inlinePadding={inlinePadding} className={className}>
      <div className="flex flex-col items-start gap-3">
        {icon}
        <div className="min-w-0 w-full">{title}</div>
      </div>
    </ContentDetailTitleHeader>
  );
}

export function ContentDetailStaticTitle({ children }: { children: ReactNode }) {
  return <h1 className={CONTENT_DETAIL_TITLE_CLASS}>{children}</h1>;
}

type ContentDetailTitleHeaderProps = {
  children: ReactNode;
  /** When false, omit horizontal padding (e.g. inside an already padded article). */
  inlinePadding?: boolean;
  className?: string;
};

export function ContentDetailTitleHeader({
  children,
  inlinePadding = true,
  className,
}: ContentDetailTitleHeaderProps) {
  return (
    <header
      className={`box-border w-full shrink-0 ${
        inlinePadding
          ? `${CONTENT_DETAIL_TOP_PADDING_CLASS} ${CONTENT_DETAIL_TITLE_BODY_GAP_CLASS} mx-auto px-4`
          : ""
      }${className ? ` ${className}` : ""}`}
      style={inlinePadding ? { maxWidth: DOCUMENT_CONTENT_MAX_WIDTH } : undefined}
    >
      {children}
    </header>
  );
}

/**
 * Icon + title headers for markdown detail views (letters, documents).
 * Edit mode uses constrained width, horizontal padding, and top inset.
 * Preview title lives inside ContentMarkdownPreviewColumn which already
 * provides those; inlinePadding=false omits duplicate padding.
 */
export function buildContentIconTitleHeaders({
  icon,
  editTitle,
  previewTitle,
}: {
  icon: ReactNode;
  editTitle: ReactNode;
  previewTitle: ReactNode;
}) {
  return {
    editHeader: (
      <ContentDetailIconTitleHeader icon={icon} title={editTitle} />
    ),
    previewTitleHeader: (
      <ContentDetailIconTitleHeader
        inlinePadding={false}
        icon={icon}
        title={previewTitle}
      />
    ),
  };
}

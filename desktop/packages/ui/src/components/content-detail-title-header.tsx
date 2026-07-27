"use client";

import type { ReactNode } from "react";

import { DOCUMENT_CONTENT_MAX_WIDTH } from "../document-editor-theme.js";

export const CONTENT_DETAIL_TITLE_CLASS = "content-detail-title";

type ContentDetailTitleHeaderProps = {
  children: ReactNode;
  /** When false, omit horizontal padding (e.g. inside an already padded column). */
  inlinePadding?: boolean;
  className?: string;
};

/** Shared detail title shell — 800px max, top inset, title→body gap (web parity). */
export function ContentDetailTitleHeader({
  children,
  inlinePadding = true,
  className,
}: ContentDetailTitleHeaderProps) {
  return (
    <header
      className={[
        "content-detail-title-header",
        inlinePadding ? "content-detail-title-header--padded" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        inlinePadding ? { maxWidth: DOCUMENT_CONTENT_MAX_WIDTH } : undefined
      }
    >
      {children}
    </header>
  );
}

export function ContentDetailStaticTitle({ children }: { children: ReactNode }) {
  return <h1 className={CONTENT_DETAIL_TITLE_CLASS}>{children}</h1>;
}

/** Wraps title block above markdown body with web `mb-6` title→body gap. */
export function ContentDetailTitleSlot({ children }: { children: ReactNode }) {
  return <div className="content-detail-title-slot">{children}</div>;
}

type ContentDetailIconTitleHeaderProps = {
  icon: ReactNode;
  title: ReactNode;
  inlinePadding?: boolean;
  className?: string;
};

export function ContentDetailIconTitleHeader({
  icon,
  title,
  inlinePadding = true,
  className,
}: ContentDetailIconTitleHeaderProps) {
  return (
    <ContentDetailTitleHeader inlinePadding={inlinePadding} className={className}>
      <div className="content-detail-icon-title">
        {icon}
        <div className="content-detail-icon-title__title">{title}</div>
      </div>
    </ContentDetailTitleHeader>
  );
}

/**
 * Icon + title headers for markdown detail views (letters, documents, journal).
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

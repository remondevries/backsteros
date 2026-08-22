"use client";

import type { ReactNode } from "react";

export type EntityDetailLayoutProps = {
  sectionLabel: string;
  title: string | null;
  icon?: ReactNode;
  meta?: ReactNode;
  body?: string | null;
  children?: ReactNode;
  resolving?: boolean;
  emptyMessage?: string;
};

/**
 * Generic detail chrome for org/contact pages.
 * Breadcrumbs belong in content chrome above page-scroll (not inline).
 */
export function EntityDetailLayout({
  sectionLabel: _sectionLabel,
  title,
  icon,
  meta,
  body,
  children,
  resolving = false,
  emptyMessage = "Nothing selected.",
}: EntityDetailLayoutProps) {
  if (resolving) {
    return (
      <div className="inbox-detail-layout">
        <div className="inbox-detail-empty">
          <p>Loading…</p>
        </div>
      </div>
    );
  }

  if (!title) {
    return (
      <div className="inbox-detail-layout">
        <div className="inbox-detail-empty">
          <p>{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="inbox-detail-layout">
      <div className="inbox-detail-body">
        {children ? (
          children
        ) : (
          <>
            <div className="journal-detail-title-row">
              {icon ? (
                <span className="journal-detail-icon" aria-hidden="true">
                  {icon}
                </span>
              ) : null}
              <h1 className="inbox-detail-title">{title}</h1>
            </div>
            {meta ? <div className="inbox-detail-meta">{meta}</div> : null}
            <div className="inbox-detail-description">
              {body?.trim()
                ? body
                : "Detail content will appear here when synced."}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import type {
  HTMLAttributes,
  ReactNode,
  Ref,
} from "react";

import { ContentSidePanelHeader } from "./content-side-panel-header.js";
import {
  ContentSidePanelEmpty,
  ContentSidePanelList,
} from "./content-side-panel-list.js";

export type ContentSidePanelShellProps = {
  /** Panel title shown in the chrome header. */
  title?: string;
  /** Optional header actions (plus button, etc.). */
  headerActions?: ReactNode;
  /** When false, omit the chrome header entirely. Default true when `title` is set. */
  showHeader?: boolean;
  /** Extra class on the root `app-content-side-panel` element. */
  className?: string;
  /** Content inserted between header and main (e.g. journal create error). */
  beforeMain?: ReactNode;
  /** Content inserted at the top of main before loading/empty/list (e.g. add-folder). */
  beforeBody?: ReactNode;
  /** Content after the list body (e.g. calendar mode footer). */
  afterMain?: ReactNode;
  /** Ref on the main column (e.g. calendar external-drag container). */
  mainRef?: Ref<HTMLDivElement>;
  loading?: boolean;
  /** Skeleton shown when `loading` and the list is empty. */
  loadingSkeleton?: ReactNode;
  /** When true (default), treat zero children as empty. Pass false when body is custom. */
  isEmpty?: boolean;
  emptyLabel?: ReactNode;
  listAriaLabel?: string;
  listRef?: Ref<HTMLElement>;
  listContainerProps?: HTMLAttributes<HTMLElement>;
  /**
   * When false, render `children` directly inside main (caller owns list/empty).
   * Default true — wraps children in ContentSidePanelList when not loading/empty.
   */
  wrapList?: boolean;
  /**
   * When true, render only the loading / empty / list body (no root, header,
   * or afterMain). Used when a parent shell already owns the chrome.
   */
  bare?: boolean;
  children?: ReactNode;
};

/**
 * Shared content side-panel chrome: header → loading / empty / list.
 * Surfaces supply row/group children; this owns the repeated shell markup.
 */
export function ContentSidePanelShell({
  title,
  headerActions,
  showHeader,
  className = "",
  beforeMain = null,
  beforeBody = null,
  afterMain = null,
  mainRef,
  loading = false,
  loadingSkeleton = null,
  isEmpty = false,
  emptyLabel = null,
  listAriaLabel,
  listRef,
  listContainerProps,
  wrapList = true,
  bare = false,
  children = null,
}: ContentSidePanelShellProps) {
  const resolvedShowHeader =
    showHeader ?? Boolean(title != null && title !== "");
  const showLoading = loading && isEmpty && loadingSkeleton != null;
  const showEmpty = isEmpty && !showLoading;

  const rootClass = ["app-content-side-panel", className]
    .filter(Boolean)
    .join(" ");

  let body: ReactNode = null;
  if (showLoading) {
    body = wrapList ? (
      <div className="app-content-side-panel-body">{loadingSkeleton}</div>
    ) : (
      loadingSkeleton
    );
  } else if (showEmpty) {
    body = emptyLabel ? (
      <ContentSidePanelEmpty>{emptyLabel}</ContentSidePanelEmpty>
    ) : null;
  } else if (wrapList) {
    body = (
      <ContentSidePanelList
        aria-label={listAriaLabel}
        ref={listRef}
        {...listContainerProps}
      >
        {children}
      </ContentSidePanelList>
    );
  } else {
    body = children;
  }

  if (bare) {
    return (
      <>
        {beforeBody}
        {body}
      </>
    );
  }

  return (
    <div className={rootClass}>
      {resolvedShowHeader && title != null ? (
        <ContentSidePanelHeader title={title} actions={headerActions} />
      ) : null}
      {beforeMain}
      <div className="app-content-side-panel-main" ref={mainRef}>
        {beforeBody}
        {body}
      </div>
      {afterMain}
    </div>
  );
}

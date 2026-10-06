"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import {
  clampEntityDetailPanelWidth,
  defaultEntityDetailPanelWidthPx,
  ENTITY_DETAIL_COLLAPSE_DURATION_MS,
  ENTITY_DETAIL_CONTENT_FADE_MS,
  ENTITY_DETAIL_PANEL_MAX_WIDTH_PX,
  ENTITY_DETAIL_PANEL_MIN_WIDTH_PX,
  ENTITY_DETAIL_PANEL_WIDTH,
  ENTITY_DETAIL_STRIP_WIDTH_PX,
  type EntityDetailWorkspaceTab,
  type EntityOverlayLayout,
} from "../../shared/entity-detail-overlay.js";
import { readStoredPanelWidth } from "../shell/resizable-side-panel.js";
import { ProjectsSidePanelIcon } from "../codebase/projects-side-panel-icon.js";
import { CollapseLayoutIcon } from "../icons/collapse-layout-icon.js";
import { ExpandLayoutIcon } from "../icons/expand-layout-icon.js";
import { PillNav } from "../shared/pill-nav.js";

export type EntityDetailOverlayProps = {
  open: boolean;
  /** When true, show the narrow reopen strip instead of the detail panel. */
  collapsed?: boolean;
  /**
   * True while the rail width is interpolating open/closed (agent-panel pattern).
   * Parent should set this via double-rAF before flipping `collapsed`.
   */
  collapseAnimating?: boolean;
  /**
   * When true, fade card/workspace to opacity 0 (entity-switch crossfade).
   */
  contentFaded?: boolean;
  /**
   * When true, fade only the expanded workspace (list ↔ page expand/collapse).
   * Independent of `contentFaded` so the profile card can stay visible.
   */
  workspaceFaded?: boolean;
  /** Narrow right panel vs full-width page layout over the list. */
  overlayLayout?: EntityOverlayLayout;
  /** Expand narrow panel to fill the content section. */
  onExpand?: () => void;
  /** Collapse full-width page layout back to the narrow panel. */
  onCollapse?: () => void;
  onHide?: () => void;
  onShow?: () => void;
  title: string;
  /**
   * Short noun for aria labels ("contact", "organization", "domain").
   * Defaults to "details".
   */
  entityLabel?: string;
  /**
   * Data-attribute stem for Escape/overlay targeting
   * (`data-contact-overlay`, `data-organization-overlay`, …).
   * Defaults to `entity`.
   */
  overlayDataKey?: string;
  children: ReactNode;
  /** Body for the expanded left workspace tab. */
  renderWorkspaceTab?: (tabId: string) => ReactNode;
  /** Controlled expanded workspace tab id. */
  workspaceTab?: string;
  onWorkspaceTabChange?: (tabId: string) => void;
  /** Visible workspace tabs when expanded to page layout. */
  workspaceTabs?: readonly EntityDetailWorkspaceTab[];
  /** Hide workspace tabs when an entity detail fills the workspace. */
  hideWorkspaceTabs?: boolean;
  /**
   * Span the workspace across the full content width (hide the profile card).
   */
  expandWorkspace?: boolean;
  /** Persist drag-resized rail width (contacts, organizations, …). */
  panelWidthStorageKey?: string;
};

/**
 * Right-side profile card rail — fixed width, hide/show strip (`]`),
 * expand opens a left workspace while the card stays right-aligned.
 *
 * Shared by contacts, organizations, and catalog domains.
 *
 * Rail collapse matches the context panel / agent rail: animate **pixel**
 * width only (no max-width clamp mid-slide; never gated on reduced-motion).
 * Entity switches: parent sets `contentFaded` for opacity crossfade.
 */
export function EntityDetailOverlay({
  open,
  collapsed = false,
  collapseAnimating = false,
  contentFaded = false,
  workspaceFaded = false,
  overlayLayout = "panel",
  onExpand,
  onCollapse,
  onHide,
  onShow,
  title,
  entityLabel = "details",
  overlayDataKey = "entity",
  children,
  renderWorkspaceTab,
  workspaceTab: controlledWorkspaceTab,
  onWorkspaceTabChange,
  workspaceTabs = [],
  hideWorkspaceTabs = false,
  expandWorkspace = false,
  panelWidthStorageKey,
}: EntityDetailOverlayProps) {
  const [uncontrolledWorkspaceTab, setUncontrolledWorkspaceTab] = useState(
    () => workspaceTabs[0]?.id ?? "",
  );
  const workspaceTab = controlledWorkspaceTab ?? uncontrolledWorkspaceTab;
  const railRef = useRef<HTMLElement | null>(null);
  /** Last measured expanded rail width — px↔px like ResizableContextPanel. */
  const [expandedWidthPx, setExpandedWidthPx] = useState<number | null>(null);
  const expandedWidthRef = useRef<number | null>(null);
  const prevOpenRef = useRef(open);
  /**
   * Enter slide when `open` goes false→true (list selection). Starts at the
   * strip width, then expands — same double-rAF pattern as the `]` toggle.
   */
  const [enterCollapsed, setEnterCollapsed] = useState(false);
  const [enterAnimating, setEnterAnimating] = useState(false);
  const enterAnimTimerRef = useRef<number | null>(null);
  const enterAnimRafRef = useRef<number | null>(null);
  const [isResizingPanel, setIsResizingPanel] = useState(false);

  const effectiveCollapsed = collapsed || enterCollapsed;
  const effectiveAnimating = collapseAnimating || enterAnimating;

  /**
   * Keep the collapsed strip mounted through the expand slide so it can fade
   * out instead of unmounting immediately (matches DesktopAgentChatPanel).
   */
  const [stripMounted, setStripMounted] = useState(effectiveCollapsed);

  useEffect(() => {
    if (effectiveCollapsed) {
      setStripMounted(true);
      return;
    }
    if (!effectiveAnimating) {
      setStripMounted(false);
    }
  }, [effectiveCollapsed, effectiveAnimating]);

  useEffect(() => {
    if (controlledWorkspaceTab == null) return;
    setUncontrolledWorkspaceTab(controlledWorkspaceTab);
  }, [controlledWorkspaceTab]);

  function setWorkspaceTab(next: string) {
    onWorkspaceTabChange?.(next);
    if (controlledWorkspaceTab === undefined) {
      setUncontrolledWorkspaceTab(next);
    }
  }

  const layout = overlayLayout === "page" ? "page" : "panel";
  // Keep the card rail mounted in page layout so expand/collapse only fades
  // the workspace overlay — never remounts the profile card.
  const railMode = open && !(layout === "page" && expandWorkspace);

  const parentContentWidthPx = useCallback((el: HTMLElement | null) => {
    return el?.parentElement?.clientWidth ?? 0;
  }, []);

  const resolveStoredOrDefaultWidthPx = useCallback(
    (el: HTMLElement | null) => {
      const parentWidth = parentContentWidthPx(el);
      const fallback = defaultEntityDetailPanelWidthPx(parentWidth);
      const raw = panelWidthStorageKey
        ? readStoredPanelWidth(
            panelWidthStorageKey,
            fallback,
            ENTITY_DETAIL_PANEL_MIN_WIDTH_PX,
            ENTITY_DETAIL_PANEL_MAX_WIDTH_PX,
          )
        : fallback;
      return clampEntityDetailPanelWidth(raw, parentWidth);
    },
    [panelWidthStorageKey, parentContentWidthPx],
  );

  const commitExpandedWidthPx = useCallback(
    (width: number, persist: boolean) => {
      const clamped = clampEntityDetailPanelWidth(
        width,
        parentContentWidthPx(railRef.current),
      );
      if (clamped <= ENTITY_DETAIL_STRIP_WIDTH_PX) return;
      expandedWidthRef.current = clamped;
      setExpandedWidthPx(clamped);
      if (persist && panelWidthStorageKey) {
        window.localStorage.setItem(panelWidthStorageKey, String(clamped));
      }
    },
    [panelWidthStorageKey, parentContentWidthPx],
  );

  function resolveOpenWidthPx(el: HTMLElement | null): number | null {
    if (
      expandedWidthRef.current != null &&
      expandedWidthRef.current > ENTITY_DETAIL_STRIP_WIDTH_PX
    ) {
      return expandedWidthRef.current;
    }
    const resolved = resolveStoredOrDefaultWidthPx(el);
    return resolved > ENTITY_DETAIL_STRIP_WIDTH_PX ? resolved : null;
  }

  const handlePanelResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (effectiveCollapsed || effectiveAnimating || layout === "page") return;
      event.preventDefault();
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);
      const startX = event.clientX;
      const startWidth =
        expandedWidthRef.current ??
        resolveStoredOrDefaultWidthPx(railRef.current);
      setIsResizingPanel(true);
      const previousUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = "none";

      function handlePointerMove(moveEvent: PointerEvent) {
        const delta = startX - moveEvent.clientX;
        commitExpandedWidthPx(startWidth + delta, false);
      }

      function finishResize(upEvent: PointerEvent) {
        setIsResizingPanel(false);
        document.body.style.userSelect = previousUserSelect;
        if (expandedWidthRef.current != null) {
          commitExpandedWidthPx(expandedWidthRef.current, true);
        }
        handle.releasePointerCapture(upEvent.pointerId);
        handle.removeEventListener("pointermove", handlePointerMove);
        handle.removeEventListener("pointerup", finishResize);
        handle.removeEventListener("pointercancel", finishResize);
      }

      handle.addEventListener("pointermove", handlePointerMove);
      handle.addEventListener("pointerup", finishResize);
      handle.addEventListener("pointercancel", finishResize);
    },
    [
      commitExpandedWidthPx,
      effectiveAnimating,
      effectiveCollapsed,
      layout,
      parentContentWidthPx,
      resolveStoredOrDefaultWidthPx,
    ],
  );

  // List selection: mount at strip width, then slide open (before paint).
  useLayoutEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    prevOpenRef.current = open;

    if (!open) {
      setEnterCollapsed(false);
      setEnterAnimating(false);
      if (enterAnimTimerRef.current != null) {
        window.clearTimeout(enterAnimTimerRef.current);
        enterAnimTimerRef.current = null;
      }
      if (enterAnimRafRef.current != null) {
        window.cancelAnimationFrame(enterAnimRafRef.current);
        enterAnimRafRef.current = null;
      }
      return;
    }

    if (!justOpened || (layout === "page" && expandWorkspace)) return;

    const targetWidth = resolveOpenWidthPx(railRef.current);
    if (targetWidth != null) {
      commitExpandedWidthPx(targetWidth, false);
    }

    setEnterCollapsed(true);
    setEnterAnimating(true);

    if (enterAnimTimerRef.current != null) {
      window.clearTimeout(enterAnimTimerRef.current);
      enterAnimTimerRef.current = null;
    }
    if (enterAnimRafRef.current != null) {
      window.cancelAnimationFrame(enterAnimRafRef.current);
      enterAnimRafRef.current = null;
    }

    enterAnimRafRef.current = window.requestAnimationFrame(() => {
      enterAnimRafRef.current = window.requestAnimationFrame(() => {
        enterAnimRafRef.current = null;
        setEnterCollapsed(false);
        enterAnimTimerRef.current = window.setTimeout(() => {
          enterAnimTimerRef.current = null;
          setEnterAnimating(false);
        }, ENTITY_DETAIL_COLLAPSE_DURATION_MS);
      });
    });
  }, [open, layout, expandWorkspace, commitExpandedWidthPx]);

  useEffect(() => {
    return () => {
      if (enterAnimTimerRef.current != null) {
        window.clearTimeout(enterAnimTimerRef.current);
      }
      if (enterAnimRafRef.current != null) {
        window.cancelAnimationFrame(enterAnimRafRef.current);
      }
    };
  }, []);

  // Seed width once when the rail opens without a stored measurement.
  useLayoutEffect(() => {
    if (!open || !railMode || effectiveCollapsed || effectiveAnimating) return;
    if (expandedWidthRef.current != null) return;
    const width = resolveStoredOrDefaultWidthPx(railRef.current);
    commitExpandedWidthPx(width, false);
  }, [
    commitExpandedWidthPx,
    effectiveAnimating,
    effectiveCollapsed,
    open,
    railMode,
    resolveStoredOrDefaultWidthPx,
  ]);

  if (!open) return null;

  const layoutAction =
    layout === "panel" && onExpand ? (
      <button
        type="button"
        className="desktop-agent-surface-tab desktop-agent-surface-tab--icon contact-detail-panel__layout-action"
        onClick={onExpand}
        aria-label={`Expand ${entityLabel}`}
        title="Expand"
      >
        <ExpandLayoutIcon size={14} />
      </button>
    ) : layout === "page" && onCollapse ? (
      <button
        type="button"
        className="desktop-agent-surface-tab desktop-agent-surface-tab--icon contact-detail-panel__layout-action"
        onClick={onCollapse}
        aria-label={`Collapse ${entityLabel}`}
        title="Collapse"
      >
        <CollapseLayoutIcon size={14} />
      </button>
    ) : null;

  const hideAction = onHide ? (
    <button
      type="button"
      className="desktop-agent-surface-tab desktop-agent-surface-tab--icon"
      onClick={onHide}
      title={`Hide ${entityLabel} (])`}
      aria-label={`Hide ${entityLabel}`}
    >
      <ProjectsSidePanelIcon size={16} collapsed={false} rail="end" />
    </button>
  ) : null;

  const overlayAttr = `data-${overlayDataKey}-overlay`;
  const overlayLayoutAttr = `data-${overlayDataKey}-overlay-layout`;

  const chrome = (
    <div
      className="desktop-journal-day-layout__chrome contact-detail-panel__chrome"
      role="dialog"
      aria-modal="false"
      aria-label={title}
      {...{ [overlayAttr]: "", [overlayLayoutAttr]: layout }}
    >
      <div className="desktop-agent-surface-tab-actions contact-detail-panel__chrome-start">
        {layoutAction}
      </div>
      {hideAction ? (
        <div className="desktop-agent-surface-tab-actions contact-detail-panel__chrome-end">
          {hideAction}
        </div>
      ) : null}
    </div>
  );

  const card = (
    <div
      className={[
        "contact-detail-panel__card",
        contentFaded ? "is-content-faded" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        width: ENTITY_DETAIL_PANEL_WIDTH,
        opacity: contentFaded ? 0 : 1,
        transition: `opacity ${ENTITY_DETAIL_CONTENT_FADE_MS}ms ease`,
      }}
    >
      {chrome}
      <div
        className={[
          "desktop-journal-day-layout__calendar-body",
          "contact-detail-panel__body",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </div>
    </div>
  );

  const strip =
    stripMounted && onShow ? (
      <button
        type="button"
        className="desktop-terminal-strip contact-detail-panel__strip"
        title={`Show ${entityLabel} (])`}
        aria-label={`Show ${title}`}
        onClick={onShow}
        tabIndex={effectiveCollapsed && !effectiveAnimating ? 0 : -1}
      >
        <ProjectsSidePanelIcon size={16} collapsed rail="end" />
      </button>
    ) : null;

  // Prefer measured px so collapse/expand interpolates px↔px (context panel).
  // Card rail stays mounted in page layout too — only the workspace overlays
  // the list, so expand/collapse never remounts (or fades) the profile card.
  const openWidthPx = expandedWidthPx ?? expandedWidthRef.current ?? null;

  const workspacePanel =
    layout === "page" && !collapsed ? (
      <div
        className={[
          "contact-detail-panel__workspace",
          "contact-detail-panel__workspace--page",
          hideWorkspaceTabs
            ? "contact-detail-panel__workspace--entity-detail"
            : null,
          expandWorkspace
            ? "contact-detail-panel__workspace--expanded"
            : null,
          contentFaded || workspaceFaded ? "is-content-faded" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        style={{
          opacity: contentFaded || workspaceFaded ? 0 : 1,
          transition: `opacity ${ENTITY_DETAIL_CONTENT_FADE_MS}ms ease`,
          // Keep clear of the profile card rail (same width basis as the rail).
          ...(!expandWorkspace && openWidthPx != null
            ? { right: openWidthPx }
            : null),
        }}
        aria-label={title}
        data-contact-workspace-expanded={expandWorkspace ? "true" : undefined}
        data-contact-entity-detail={hideWorkspaceTabs ? "true" : undefined}
      >
        {hideWorkspaceTabs || workspaceTabs.length === 0 ? null : (
          <div className="contact-section-tabs contact-detail-panel__workspace-tabs">
            <PillNav
              className="contact-section-tabs__nav"
              ariaLabel={`${entityLabel} workspace`}
              items={workspaceTabs.map((tab) => ({
                value: tab.id,
                label: tab.label,
              }))}
              value={workspaceTab}
              onChange={setWorkspaceTab}
            />
          </div>
        )}
        <div
          className="contact-detail-panel__workspace-body"
          role="region"
          aria-label={
            hideWorkspaceTabs
              ? "Detail"
              : (workspaceTabs.find((tab) => tab.id === workspaceTab)?.label ??
                "Workspace")
          }
        >
          {renderWorkspaceTab?.(workspaceTab) ?? null}
        </div>
      </div>
    ) : null;

  const railWidthPx = effectiveCollapsed
    ? ENTITY_DETAIL_STRIP_WIDTH_PX
    : openWidthPx;
  const railStyle: CSSProperties =
    railWidthPx != null
      ? {
          width: railWidthPx,
          minWidth: railWidthPx,
          flexShrink: 0,
        }
      : { width: ENTITY_DETAIL_PANEL_WIDTH };
  const bodyWidthPx = openWidthPx;

  // Expanded workspace alone (nested agent): no profile card rail.
  if (layout === "page" && !collapsed && expandWorkspace) {
    return workspacePanel;
  }

  return (
    <>
      {workspacePanel}
      <aside
        ref={railRef}
        className={[
          "journal-day-layout__calendar",
          "contact-detail-panel",
          "contact-detail-panel--rail",
          "resizable-side-panel",
          effectiveCollapsed ? "is-collapsed" : null,
          effectiveAnimating ? "is-collapse-animating" : null,
          isResizingPanel ? "is-resizing" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label={title}
        {...{
          [overlayAttr]: "",
          [overlayLayoutAttr]: effectiveCollapsed
            ? "collapsed"
            : layout === "page"
              ? "page"
              : "panel",
        }}
        style={railStyle}
      >
        {layout === "panel" &&
        !effectiveCollapsed &&
        !effectiveAnimating &&
        panelWidthStorageKey ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panel"
            aria-valuemin={ENTITY_DETAIL_PANEL_MIN_WIDTH_PX}
            aria-valuemax={ENTITY_DETAIL_PANEL_MAX_WIDTH_PX}
            aria-valuenow={openWidthPx ?? undefined}
            onPointerDown={handlePanelResizePointerDown}
            className="resizable-side-panel__handle resizable-side-panel__handle--start"
          >
            <span
              aria-hidden="true"
              className={`resizable-side-panel__handle-line${
                isResizingPanel ? " is-active" : ""
              }`}
            />
          </div>
        ) : null}
        <div
          className="contact-detail-panel__rail-body"
          style={
            bodyWidthPx != null
              ? {
                  width: bodyWidthPx,
                  minWidth: bodyWidthPx,
                  maxWidth: bodyWidthPx,
                }
              : undefined
          }
          aria-hidden={effectiveCollapsed || undefined}
          {...(effectiveCollapsed && !effectiveAnimating
            ? { inert: true }
            : {})}
        >
          {card}
        </div>
        {strip}
      </aside>
    </>
  );
}

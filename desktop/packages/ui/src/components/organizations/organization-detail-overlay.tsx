"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import {
  ORGANIZATION_DETAIL_COLLAPSE_DURATION_MS,
  ORGANIZATION_DETAIL_CONTENT_FADE_MS,
  ORGANIZATION_DETAIL_PANEL_WIDTH,
  ORGANIZATION_DETAIL_STRIP_WIDTH_PX,
  ORGANIZATION_EXPANDED_WORKSPACE_TABS,
  type OrganizationExpandedWorkspaceTabId,
  type OrganizationOverlayLayout,
} from "../../organizations/organization-overlay.js";
import { ProjectsSidePanelIcon } from "../codebase/projects-side-panel-icon.js";
import { CollapseLayoutIcon } from "../icons/collapse-layout-icon.js";
import { ExpandLayoutIcon } from "../icons/expand-layout-icon.js";
import { PillNav } from "../shared/pill-nav.js";

export type OrganizationDetailOverlayProps = {
  open: boolean;
  /** When true, show the narrow reopen strip instead of the detail panel. */
  collapsed?: boolean;
  /**
   * True while the rail width is interpolating open/closed (agent-panel pattern).
   * Parent should set this via double-rAF before flipping `collapsed`.
   */
  collapseAnimating?: boolean;
  /**
   * When true, fade card/workspace to opacity 0 (contact-switch crossfade).
   */
  contentFaded?: boolean;
  /**
   * When true, fade only the expanded workspace (list ↔ page expand/collapse).
   * Independent of `contentFaded` so the contact card can stay visible.
   */
  workspaceFaded?: boolean;
  /** Narrow right panel vs full-width page layout over the contacts list. */
  overlayLayout?: OrganizationOverlayLayout;
  /** Expand narrow panel to fill the content section. */
  onExpand?: () => void;
  /** Collapse full-width page layout back to the narrow panel. */
  onCollapse?: () => void;
  onHide?: () => void;
  onShow?: () => void;
  title: string;
  children: ReactNode;
  /** Body for the expanded left workspace tab (Projects / Contacts / …). */
  renderWorkspaceTab?: (tab: OrganizationExpandedWorkspaceTabId) => ReactNode;
  /** Controlled expanded workspace tab. */
  workspaceTab?: OrganizationExpandedWorkspaceTabId;
  onWorkspaceTabChange?: (tab: OrganizationExpandedWorkspaceTabId) => void;
  /** Override visible workspace tabs (e.g. hide finance until linked data exists). */
  workspaceTabs?: readonly {
    id: OrganizationExpandedWorkspaceTabId;
    label: string;
  }[];
  /** Hide workspace tabs when an entity detail fills the workspace. */
  hideWorkspaceTabs?: boolean;
  /**
   * Span the workspace across the full content width (hide the organization card).
   */
  expandWorkspace?: boolean;
};

/**
 * Right-side organization profile card — fixed width, hide/show strip (`]`),
 * expand opens a left workspace (tabs) while the card stays right-aligned.
 *
 * Rail collapse matches the context panel / agent rail: animate **pixel**
 * width only (no max-width clamp mid-slide; never gated on reduced-motion).
 * Organization switches: parent sets `contentFaded` for opacity crossfade.
 */
export function OrganizationDetailOverlay({
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
  children,
  renderWorkspaceTab,
  workspaceTab: controlledWorkspaceTab,
  onWorkspaceTabChange,
  workspaceTabs = ORGANIZATION_EXPANDED_WORKSPACE_TABS,
  hideWorkspaceTabs = false,
  expandWorkspace = false,
}: OrganizationDetailOverlayProps) {
  const [uncontrolledWorkspaceTab, setUncontrolledWorkspaceTab] =
    useState<OrganizationExpandedWorkspaceTabId>(
      workspaceTabs[0]?.id ?? "projects",
    );  const workspaceTab = controlledWorkspaceTab ?? uncontrolledWorkspaceTab;
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

  function setWorkspaceTab(next: OrganizationExpandedWorkspaceTabId) {
    onWorkspaceTabChange?.(next);
    if (controlledWorkspaceTab === undefined) {
      setUncontrolledWorkspaceTab(next);
    }
  }

  const layout = overlayLayout === "page" ? "page" : "panel";
  // Keep the card rail mounted in page layout so expand/collapse only fades
  // the workspace overlay — never remounts the contact card.
  const railMode = open && !(layout === "page" && expandWorkspace);

  function resolveOpenWidthPx(el: HTMLElement | null): number | null {
    if (
      expandedWidthRef.current != null &&
      expandedWidthRef.current > ORGANIZATION_DETAIL_STRIP_WIDTH_PX
    ) {
      return expandedWidthRef.current;
    }
    const parent = el?.parentElement;
    if (parent) {
      const fromParent = Math.round(parent.clientWidth * 0.3);
      if (fromParent > ORGANIZATION_DETAIL_STRIP_WIDTH_PX) return fromParent;
    }
    return null;
  }

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
      expandedWidthRef.current = targetWidth;
      setExpandedWidthPx(targetWidth);
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
        }, ORGANIZATION_DETAIL_COLLAPSE_DURATION_MS);
      });
    });
  }, [open, layout, expandWorkspace]);

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

  // Capture expanded width before collapse so we can interpolate px → strip.
  useLayoutEffect(() => {
    if (!railMode || effectiveCollapsed || effectiveAnimating) return;
    const el = railRef.current;
    if (!el) return;
    const width = Math.round(el.getBoundingClientRect().width);
    if (width > ORGANIZATION_DETAIL_STRIP_WIDTH_PX) {
      expandedWidthRef.current = width;
      setExpandedWidthPx(width);
    }
  }, [railMode, effectiveCollapsed, effectiveAnimating, open]);

  useEffect(() => {
    if (!railMode || effectiveCollapsed || effectiveAnimating) return;
    const el = railRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = Math.round(entry.contentRect.width);
      if (width > ORGANIZATION_DETAIL_STRIP_WIDTH_PX) {
        expandedWidthRef.current = width;
        setExpandedWidthPx(width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [railMode, effectiveCollapsed, effectiveAnimating]);

  if (!open) return null;

  const layoutAction =
    layout === "panel" && onExpand ? (
      <button
        type="button"
        className="desktop-agent-surface-tab desktop-agent-surface-tab--icon contact-detail-panel__layout-action"
        onClick={onExpand}
        aria-label="Expand organization"
        title="Expand"
      >
        <ExpandLayoutIcon size={14} />
      </button>
    ) : layout === "page" && onCollapse ? (
      <button
        type="button"
        className="desktop-agent-surface-tab desktop-agent-surface-tab--icon contact-detail-panel__layout-action"
        onClick={onCollapse}
        aria-label="Collapse organization"
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
      title="Hide organization (])"
      aria-label="Hide organization"
    >
      <ProjectsSidePanelIcon size={16} collapsed={false} rail="end" />
    </button>
  ) : null;

  const chrome = (
    <div
      className="desktop-journal-day-layout__chrome contact-detail-panel__chrome"
      role="dialog"
      aria-modal="false"
      aria-label={title}
      data-organization-overlay=""
      data-organization-overlay-layout={layout}
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
        width: ORGANIZATION_DETAIL_PANEL_WIDTH,
        opacity: contentFaded ? 0 : 1,
        transition: `opacity ${ORGANIZATION_DETAIL_CONTENT_FADE_MS}ms ease`,
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
        title="Show organization (])"
        aria-label={`Show ${title}`}
        onClick={onShow}
        tabIndex={
          effectiveCollapsed && !effectiveAnimating ? 0 : -1
        }
      >
        <ProjectsSidePanelIcon size={16} collapsed rail="end" />
      </button>
    ) : null;

  // Prefer measured px so collapse/expand interpolates px↔px (context panel).
  // Card rail stays mounted in page layout too — only the workspace overlays
  // the list, so expand/collapse never remounts (or fades) the contact card.
  const openWidthPx =
    expandedWidthPx ?? expandedWidthRef.current ?? null;

  const workspacePanel =
    layout === "page" && !collapsed ? (
      <div
        className={[
          "contact-detail-panel__workspace",
          "contact-detail-panel__workspace--page",
          hideWorkspaceTabs ? "contact-detail-panel__workspace--entity-detail" : null,
          expandWorkspace ? "contact-detail-panel__workspace--expanded" : null,
          contentFaded || workspaceFaded ? "is-content-faded" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        style={{
          opacity: contentFaded || workspaceFaded ? 0 : 1,
          transition: `opacity ${ORGANIZATION_DETAIL_CONTENT_FADE_MS}ms ease`,
          // Keep clear of the contact card rail (same width basis as the rail).
          ...(!expandWorkspace && openWidthPx != null
            ? { right: openWidthPx }
            : null),
        }}
        aria-label={title}
        data-contact-workspace-expanded={expandWorkspace ? "true" : undefined}
        data-contact-entity-detail={hideWorkspaceTabs ? "true" : undefined}
      >
        {hideWorkspaceTabs ? null : (
          <div className="contact-section-tabs contact-detail-panel__workspace-tabs">
            <PillNav
              className="contact-section-tabs__nav"
              ariaLabel="Contact workspace"
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
              : (workspaceTabs.find(
                  (tab) => tab.id === workspaceTab,
                )?.label ?? "Workspace")
          }
        >
          {renderWorkspaceTab?.(workspaceTab) ?? null}
        </div>
      </div>
    ) : null;

  const railWidthPx = effectiveCollapsed
    ? ORGANIZATION_DETAIL_STRIP_WIDTH_PX
    : openWidthPx;
  const railStyle: CSSProperties =
    railWidthPx != null
      ? { width: railWidthPx }
      : { width: ORGANIZATION_DETAIL_PANEL_WIDTH };
  const bodyWidthPx = openWidthPx;

  // Expanded workspace alone (nested agent): no contact card rail.
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
          effectiveCollapsed ? "is-collapsed" : null,
          effectiveAnimating ? "is-collapse-animating" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label={title}
        data-organization-overlay=""
        data-organization-overlay-layout={
          effectiveCollapsed
            ? "collapsed"
            : layout === "page"
              ? "page"
              : "panel"
        }
        style={railStyle}
      >
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

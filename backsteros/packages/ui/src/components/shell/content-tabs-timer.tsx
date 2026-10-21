"use client";

import { formatTrackedDuration } from "@backsteros/contracts";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
} from "@primer/octicons-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { useTrackedTimerOptional } from "../../tracked-timer/tracked-timer-context.js";
import type { TrackedTimerListItem } from "../../tracked-timer/tracked-timer-types.js";
import { getTaskStatusIdBadgeStyle } from "../../tasks/task-status-header-gradient.js";

const PANEL_MIN_WIDTH = 390;
const PANEL_MAX_WIDTH = 600;
const PANEL_GAP = 6;
const VIEWPORT_PADDING = 8;

/**
 * Real app URI on the anchor (`href`) so hosts/status-bar see the path.
 * Navigation is always driven through `onNavigate` — do not rely on SPA Link
 * or a bare `<a>` default (DESIGN chrome must invoke open_backsteros_href).
 */
function ContentTabsTimerOptionNav({
  href,
  entityId,
  label,
  onNavigate,
  onClose,
}: {
  href: string;
  entityId: string;
  label: string;
  onNavigate: (href: string) => void;
  onClose: () => void;
}) {
  const trimmed =
    href.trim() ||
    (entityId.trim() ? `/tasks/${encodeURIComponent(entityId.trim())}` : "");
  if (!trimmed) return null;

  const go = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onNavigate(trimmed);
    onClose();
  };

  return (
    <a
      href={trimmed}
      className="content-tabs-timer__option-nav"
      aria-label={label}
      title={label}
      data-tauri-drag-region="false"
      // pointerdown: DESIGN menu sits under a native webview hole; click can be lost.
      onPointerDown={go}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <ChevronRightIcon size={12} aria-hidden="true" />
    </a>
  );
}

function splitDurationDisplay(totalSeconds: number): {
  head: string;
  seconds: string;
} {
  const formatted = formatTrackedDuration(totalSeconds);
  return {
    head: formatted.slice(0, -2),
    seconds: formatted.slice(-2),
  };
}

type ContentTabsTimerMenuProps = {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  activeKey: string;
  menuTimers: TrackedTimerListItem[];
  getElapsedSeconds: (key: string) => number;
  onSelect: (key: string) => void;
  onToggle: (key: string) => void;
  onNavigate: (href: string) => void;
};

function ContentTabsTimerMenu({
  open,
  onClose,
  anchorRef,
  activeKey,
  menuTimers,
  getElapsedSeconds,
  onSelect,
  onToggle,
  onNavigate,
}: ContentTabsTimerMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({
    visibility: "hidden",
  });


  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const width = Math.min(
      PANEL_MAX_WIDTH,
      Math.max(PANEL_MIN_WIDTH, rect.width),
      window.innerWidth - VIEWPORT_PADDING * 2,
    );
    const maxLeft = window.innerWidth - width - VIEWPORT_PADDING;
    const left = Math.max(VIEWPORT_PADDING, Math.min(rect.right - width, maxLeft));

    const panelHeight = panelRef.current?.offsetHeight ?? 120;
    const spaceBelow =
      window.innerHeight - rect.bottom - PANEL_GAP - VIEWPORT_PADDING;
    const openUpward =
      spaceBelow < panelHeight && rect.top > panelHeight + PANEL_GAP;
    const top = openUpward
      ? Math.max(VIEWPORT_PADDING, rect.top - panelHeight - PANEL_GAP)
      : rect.bottom + PANEL_GAP;

    setPanelStyle({
      top: `${top}px`,
      left: `${left}px`,
      width: `${width}px`,
      visibility: "visible",
    });
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) {
      setPanelStyle({ visibility: "hidden" });
      return;
    }
    updatePosition();
    const frame = window.requestAnimationFrame(() => updatePosition());
    return () => window.cancelAnimationFrame(frame);
  }, [menuTimers.length, open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    function handleReposition() {
      updatePosition();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [anchorRef, onClose, open, updatePosition]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      ref={panelRef}
      className="content-tabs-timer__dropdown"
      style={panelStyle}
      role="menu"
      data-tauri-drag-region="false"
    >
      {menuTimers.length === 0 ? (
        <p className="content-tabs-timer__empty" role="status">
          Open a task to start tracking time.
        </p>
      ) : (
        menuTimers.map((entry) => {
          const displayId = entry.subtitle?.trim() || null;
          const navigateLabel = displayId
            ? `Go to ${displayId}`
            : `Go to ${entry.title}`;
          const toggleLabel = entry.isRunning
            ? `Pause timer for ${entry.title}`
            : `Start timer for ${entry.title}`;
          return (
            <div
              key={entry.key}
              className={[
                "content-tabs-timer__option",
                entry.key === activeKey
                  ? "content-tabs-timer__option--active"
                  : null,
                entry.isRunning ? "content-tabs-timer__option--running" : null,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <button
                type="button"
                role="menuitem"
                className="content-tabs-timer__option-toggle"
                aria-label={toggleLabel}
                aria-pressed={entry.isRunning}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggle(entry.key);
                }}
              >
                {entry.isRunning ? (
                  <PauseIcon size={12} aria-hidden="true" />
                ) : (
                  <PlayIcon size={12} aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                role="menuitem"
                className="content-tabs-timer__option-main"
                aria-label={`Open ${entry.title}`}
                onClick={() => {
                  // Title row opens the task (same as the chevron) — large hit target.
                  onSelect(entry.key);
                  const href =
                    entry.href.trim() ||
                    (entry.entityId.trim()
                      ? `/tasks/${encodeURIComponent(entry.entityId.trim())}`
                      : "");
                  if (href) onNavigate(href);
                  onClose();
                }}
              >
                <span className="content-tabs-timer__option-label">
                  {displayId ? (
                    <>
                      <span
                        className={[
                          "content-tabs-timer__option-id",
                          entry.statusKey
                            ? "content-tabs-timer__option-id--status"
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        style={
                          entry.statusKey
                            ? getTaskStatusIdBadgeStyle(entry.statusKey)
                            : undefined
                        }
                      >
                        {displayId}
                      </span>
                      <span className="content-tabs-timer__option-title">
                        {entry.title}
                      </span>
                    </>
                  ) : (
                    entry.title
                  )}
                </span>
                <span className="content-tabs-timer__option-time">
                  {formatTrackedDuration(getElapsedSeconds(entry.key))}
                </span>
              </button>
              <ContentTabsTimerOptionNav
                href={entry.href}
                entityId={entry.entityId}
                label={navigateLabel}
                onNavigate={onNavigate}
                onClose={onClose}
              />
            </div>
          );
        })
      )}
    </div>,
    document.body,
  );
}

export function ContentTabsTimer() {
  const timer = useTrackedTimerOptional();
  const [open, setOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);

  const runningCount = timer?.runningKeys.length ?? 0;
  const recentTimers = timer?.recentTimers ?? [];
  const activeTimer = useMemo(() => {
    if (!timer || recentTimers.length === 0) return null;
    const active = timer.activeKey
      ? (recentTimers.find((entry) => entry.key === timer.activeKey) ?? null)
      : null;
    const running = timer.resolvedRunningKey
      ? (recentTimers.find(
          (entry) => entry.key === timer.resolvedRunningKey,
        ) ?? null)
      : null;
    // When something is running, the chrome follows that clock across apps —
    // a paused local "focused" selection must not hide the live shared timer.
    if (running && (!active || !active.isRunning)) {
      return running;
    }
    return active ?? running ?? recentTimers[0] ?? null;
  }, [recentTimers, timer]);
  const timerTick = timer?.timerTick ?? 0;

  // Always mount chrome when the provider is present — idle shows 00:00 so the
  // top-right control is discoverable before the first timer session.
  if (!timer) {
    return null;
  }

  void timerTick;
  const idle = activeTimer == null;
  const elapsedSeconds = activeTimer
    ? timer.getElapsedSeconds(activeTimer.key)
    : 0;
  const liveDisplay = splitDurationDisplay(elapsedSeconds);
  const menuTimers = timer.recentTimers;
  const displayId = activeTimer?.subtitle?.trim() || null;
  const headerRunning = Boolean(activeTimer?.isRunning);

  return (
    <div
      className={[
        "content-tabs-timer",
        idle ? "is-idle" : null,
        runningCount > 0 ? "is-running" : null,
        runningCount > 1 ? "has-multiple-running" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      data-tauri-drag-region="false"
      data-running-count={runningCount > 0 ? String(runningCount) : undefined}
    >
      <div ref={controlRef} className="content-tabs-timer__control">
        <button
          type="button"
          className="content-tabs-timer__toggle"
          aria-label={
            idle
              ? "No timer yet — open a task to start tracking"
              : headerRunning
                ? "Pause timer"
                : "Start timer"
          }
          aria-pressed={headerRunning}
          title={
            idle ? "Open a task to start tracking time" : undefined
          }
          disabled={idle}
          onClick={() => {
            if (!activeTimer) return;
            timer.toggleTimer(activeTimer.key);
          }}
        >
          {headerRunning ? (
            <PauseIcon size={12} aria-hidden="true" />
          ) : (
            <PlayIcon size={12} aria-hidden="true" />
          )}
        </button>
        {runningCount > 1 ? (
          <span
            className="content-tabs-timer__running-count"
            title={`${runningCount} timers running`}
          >
            {runningCount}
          </span>
        ) : null}
        {displayId && activeTimer ? (
          <button
            type="button"
            className={[
              "content-tabs-timer__pill-id",
              activeTimer.statusKey
                ? "content-tabs-timer__pill-id--status"
                : null,
            ]
              .filter(Boolean)
              .join(" ")}
            style={
              activeTimer.statusKey
                ? getTaskStatusIdBadgeStyle(activeTimer.statusKey)
                : undefined
            }
            aria-label={`Open ${displayId}`}
            title={activeTimer.title}
            onClick={() => {
              timer.selectTimer(activeTimer.key);
            }}
          >
            {displayId}
          </button>
        ) : null}
        <button
          type="button"
          className="content-tabs-timer__display"
          aria-label="Open timer menu"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((current) => !current)}
        >
          <span className="content-tabs-timer__display-time">
            <span className="content-tabs-timer__live-head">{liveDisplay.head}</span>
            <span
              className={[
                "content-tabs-timer__seconds",
                headerRunning ? "is-live" : null,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {liveDisplay.seconds}
            </span>
          </span>
        </button>
        <button
          type="button"
          className="content-tabs-timer__menu"
          aria-label="Switch tracked timer"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((current) => !current)}
        >
          <ChevronDownIcon size={12} aria-hidden="true" />
        </button>
      </div>
      <ContentTabsTimerMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={controlRef}
        activeKey={activeTimer?.key ?? ""}
        menuTimers={menuTimers}
        getElapsedSeconds={timer.getElapsedSeconds}
        onSelect={(key) => timer.selectTimer(key, { navigate: false })}
        onToggle={(key) => timer.toggleTimer(key)}
        onNavigate={(href) => {
          const next = href.trim();
          if (!next) return;
          timer.onNavigate?.(next);
        }}
      />
    </div>
  );
}

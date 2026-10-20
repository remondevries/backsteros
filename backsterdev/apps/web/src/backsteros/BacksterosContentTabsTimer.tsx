import { ChevronDown, ChevronRight, Pause, Play } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { fetchBacksterosProject, fetchBacksterosTask, createBacksterosTaskActivity } from "./client";
import { formatTrackedDuration } from "./trackedTime";
import { useBacksterosTaskDetailUiStore } from "./taskDetailUiStore";
import {
  getTrackedTimerActiveKey,
  getTrackedTimerElapsedSeconds,
  getTrackedTimerVersion,
  listRecentTrackedTimers,
  listRunningTrackedTimerKeys,
  setTrackedTimerActiveKey,
  subscribeTrackedTimers,
  toggleTrackedTimer,
} from "./trackedTimerStore";

import "./backsterosContentTabsTimer.css";

const PANEL_MIN_WIDTH = 390;
const PANEL_MAX_WIDTH = 600;
const PANEL_GAP = 6;
const VIEWPORT_PADDING = 8;

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

function ContentTabsTimerMenu(props: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly anchorRef: RefObject<HTMLElement | null>;
  readonly activeKey: string;
  readonly onSelect: (key: string) => void;
  readonly onToggle: (key: string) => void;
  readonly onNavigate: (taskId: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({
    visibility: "hidden",
  });
  useSyncExternalStore(subscribeTrackedTimers, getTrackedTimerVersion, getTrackedTimerVersion);
  const menuTimers = listRecentTrackedTimers();

  const updatePosition = useCallback(() => {
    const anchor = props.anchorRef.current;
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
  }, [props.anchorRef]);

  useLayoutEffect(() => {
    if (!props.open) {
      setPanelStyle({ visibility: "hidden" });
      return;
    }
    updatePosition();
    const frame = window.requestAnimationFrame(() => updatePosition());
    return () => window.cancelAnimationFrame(frame);
  }, [menuTimers.length, props.open, updatePosition]);

  useEffect(() => {
    if (!props.open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (props.anchorRef.current?.contains(target)) return;
      props.onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        props.onClose();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [props, updatePosition]);

  if (!props.open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      ref={panelRef}
      className="bos-content-tabs-timer__dropdown"
      style={panelStyle}
      role="menu"
    >
      {menuTimers.map((entry) => {
        const displayId = entry.subtitle?.trim() || null;
        const navigateLabel = displayId
          ? `Go to ${displayId}`
          : `Go to ${entry.title}`;
        const toggleLabel = entry.isRunning
          ? `Pause timer for ${entry.title}`
          : `Start timer for ${entry.title}`;
        const elapsed = getTrackedTimerElapsedSeconds(entry.key);
        return (
          <div
            key={entry.key}
            className={[
              "bos-content-tabs-timer__option",
              entry.key === props.activeKey
                ? "bos-content-tabs-timer__option--active"
                : null,
              entry.isRunning ? "bos-content-tabs-timer__option--running" : null,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <button
              type="button"
              role="menuitem"
              className="bos-content-tabs-timer__option-toggle"
              aria-label={toggleLabel}
              aria-pressed={entry.isRunning}
              onClick={(event) => {
                event.stopPropagation();
                props.onToggle(entry.key);
              }}
            >
              {entry.isRunning ? (
                <Pause className="size-3" aria-hidden="true" />
              ) : (
                <Play className="size-3" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              role="menuitem"
              className="bos-content-tabs-timer__option-main"
              aria-label={`Select timer for ${entry.title}`}
              onClick={() => {
                props.onSelect(entry.key);
                props.onClose();
              }}
            >
              <span className="bos-content-tabs-timer__option-label">
                {displayId ? (
                  <>
                    <span className="bos-content-tabs-timer__option-id">
                      {displayId}
                    </span>
                    <span className="bos-content-tabs-timer__option-title">
                      {entry.title}
                    </span>
                  </>
                ) : (
                  entry.title
                )}
              </span>
              <span className="bos-content-tabs-timer__option-time">
                {formatTrackedDuration(elapsed)}
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="bos-content-tabs-timer__option-nav"
              aria-label={navigateLabel}
              title={navigateLabel}
              onClick={() => {
                props.onNavigate(entry.key);
                props.onClose();
              }}
            >
              <ChevronRight className="size-3" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

/**
 * Chrome timer pill + dropdown mirroring BacksterOS `ContentTabsTimer`, fed by
 * the shared recent-timers sync into `trackedTimerStore`.
 */
export function BacksterosContentTabsTimer() {
  const [open, setOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);
  const openTaskDetail = useBacksterosTaskDetailUiStore((state) => state.openTaskDetail);

  useSyncExternalStore(subscribeTrackedTimers, getTrackedTimerVersion, getTrackedTimerVersion);

  const recent = listRecentTrackedTimers();
  const runningKeys = listRunningTrackedTimerKeys();
  const runningCount = runningKeys.length;
  const displayKey =
    getTrackedTimerActiveKey() ?? recent[0]?.key ?? null;
  const activeTimer = useMemo(
    () => (displayKey ? (recent.find((entry) => entry.key === displayKey) ?? null) : null),
    [displayKey, recent],
  );

  const navigateToTask = useCallback(
    async (taskId: string) => {
      try {
        const task = await fetchBacksterosTask(taskId);
        if (!task.projectId) return;
        const project = await fetchBacksterosProject(task.projectId);
        openTaskDetail({ taskId, project });
      } catch {
        // Best-effort navigation from chrome.
      }
    },
    [openTaskDetail],
  );

  const onToggle = useCallback((key: string) => {
    const wasRunning = listRunningTrackedTimerKeys().includes(key);
    const elapsed = getTrackedTimerElapsedSeconds(key);
    const action = toggleTrackedTimer(key, elapsed);
    setTrackedTimerActiveKey(key);
    if (action === "start" && !wasRunning) {
      void createBacksterosTaskActivity(key, { type: "timer_started" }).catch(
        () => {},
      );
    }
  }, []);

  if (!activeTimer) {
    return null;
  }

  const elapsedSeconds = getTrackedTimerElapsedSeconds(activeTimer.key);
  const liveDisplay = splitDurationDisplay(elapsedSeconds);
  const displayId = activeTimer.subtitle?.trim() || null;
  const headerRunning = activeTimer.isRunning;

  return (
    <div
      className={[
        "bos-content-tabs-timer",
        runningCount > 0 ? "is-running" : null,
        runningCount > 1 ? "has-multiple-running" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      data-running-count={runningCount > 0 ? String(runningCount) : undefined}
    >
      <div ref={controlRef} className="bos-content-tabs-timer__control">
        <button
          type="button"
          className="bos-content-tabs-timer__toggle"
          aria-label={headerRunning ? "Pause timer" : "Start timer"}
          aria-pressed={headerRunning}
          onClick={() => onToggle(activeTimer.key)}
        >
          {headerRunning ? (
            <Pause className="size-3" aria-hidden="true" />
          ) : (
            <Play className="size-3" aria-hidden="true" />
          )}
        </button>
        {runningCount > 1 ? (
          <span
            className="bos-content-tabs-timer__running-count"
            title={`${runningCount} timers running`}
          >
            {runningCount}
          </span>
        ) : null}
        {displayId ? (
          <button
            type="button"
            className="bos-content-tabs-timer__pill-id"
            aria-label={`Open ${displayId}`}
            title={activeTimer.title}
            onClick={() => {
              setTrackedTimerActiveKey(activeTimer.key);
              void navigateToTask(activeTimer.key);
            }}
          >
            {displayId}
          </button>
        ) : null}
        <button
          type="button"
          className="bos-content-tabs-timer__display"
          aria-label="Open timer menu"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((current) => !current)}
        >
          <span className="bos-content-tabs-timer__display-time">
            <span className="bos-content-tabs-timer__live-head">
              {liveDisplay.head}
            </span>
            <span
              className={[
                "bos-content-tabs-timer__seconds",
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
          className="bos-content-tabs-timer__menu"
          aria-label="Switch tracked timer"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((current) => !current)}
        >
          <ChevronDown className="size-3" aria-hidden="true" />
        </button>
      </div>
      <ContentTabsTimerMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={controlRef}
        activeKey={activeTimer.key}
        onSelect={(key) => setTrackedTimerActiveKey(key)}
        onToggle={onToggle}
        onNavigate={(taskId) => {
          void navigateToTask(taskId);
        }}
      />
    </div>
  );
}

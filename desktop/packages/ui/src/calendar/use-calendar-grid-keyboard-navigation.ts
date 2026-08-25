"use client";

import type { EventMountArg } from "@fullcalendar/core";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "../components/list-nav/list-keyboard-navigation-provider.js";
import { useListDismissDetailShortcut } from "../list-nav/use-list-clear-selection-shortcut.js";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "../list-nav/list-keyboard-nav-zone.js";
import type { TaskCalendarEvent } from "./calendar-events.js";
import {
  applyCalendarGridKeyboardHighlight,
  buildCalendarDayYmdsInRange,
  buildCalendarEventKeyboardGridForNavigation,
  CALENDAR_GRID_KEYBOARD_HIGHLIGHT_CLASS,
  CALENDAR_GRID_KEYBOARD_ITEM_ATTR,
  calendarMoreLinkItemId,
  closeCalendarMorePopoverForDay,
  findCalendarKeyboardHighlightTarget,
  findOpenCalendarMorePopoverForDay,
  findOpenCalendarMorePopoverYmd,
  flattenCalendarEventKeyboardGrid,
  getFirstPopoverAllDayEventId,
  parseCalendarMoreLinkItemId,
  resolveCalendarGridKeyboardNextItemId,
} from "./calendar-grid-keyboard.js";
import type { CalendarViewMode } from "./calendar-view-modes.js";
import {
  getCalendarMainKeyboardHighlightId,
  setCalendarMainKeyboardHighlightId,
} from "./calendar-keyboard-session.js";

function activateCalendarMoreLink(moreLink: HTMLElement): void {
  moreLink.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, view: window }),
  );
}

function waitForCalendarMorePopover(
  container: HTMLElement,
  ymd: string,
  onReady: (firstId: string | null) => void,
): () => void {
  const tryFocus = () => {
    const firstId = getFirstPopoverAllDayEventId(container, ymd);
    if (firstId) {
      onReady(firstId);
      return true;
    }
    return Boolean(findOpenCalendarMorePopoverForDay(container, ymd));
  };

  if (tryFocus()) {
    return () => {};
  }

  const observer = new MutationObserver(() => {
    if (tryFocus()) {
      observer.disconnect();
    }
  });

  observer.observe(container, { childList: true, subtree: true });
  observer.observe(document.body, { childList: true, subtree: true });

  requestAnimationFrame(() => {
    if (tryFocus()) {
      observer.disconnect();
    }
  });

  return () => observer.disconnect();
}

function calendarNavGridsEqual(left: string[][], right: string[][]): boolean {
  if (left.length !== right.length) return false;
  return left.every((column, index) => {
    const other = right[index] ?? [];
    if (column.length !== other.length) return false;
    return column.every((id, rowIndex) => id === other[rowIndex]);
  });
}

export function useCalendarGridKeyboardNavigation({
  containerRef,
  events,
  visibleRange,
  viewMode,
  selectedEventId = null,
  enabled = true,
  onActivateEvent,
}: {
  containerRef: RefObject<HTMLElement | null>;
  events: readonly TaskCalendarEvent[];
  visibleRange: { start: Date; end: Date } | null;
  viewMode: CalendarViewMode;
  selectedEventId?: string | null;
  enabled?: boolean;
  onActivateEvent?: (eventId: string) => void;
}) {
  const highlightedIdRef = useRef<string | null>(null);
  const [navItemIds, setNavItemIds] = useState<string[]>([]);
  const [morePopoverOpenYmd, setMorePopoverOpenYmd] = useState<string | null>(
    null,
  );
  const navGridRef = useRef<string[][]>([]);

  const refreshNavigationGrid = useCallback(() => {
    const container = containerRef.current;
    if (!container || !visibleRange) {
      navGridRef.current = [];
      setNavItemIds([]);
      return;
    }

    const grid = buildCalendarEventKeyboardGridForNavigation({
      container,
      events,
      rangeStart: visibleRange.start,
      rangeEnd: visibleRange.end,
      viewMode,
    });
    if (calendarNavGridsEqual(grid, navGridRef.current)) {
      return;
    }
    navGridRef.current = grid;
    setNavItemIds(flattenCalendarEventKeyboardGrid(grid));
  }, [containerRef, events, viewMode, visibleRange]);

  useLayoutEffect(() => {
    refreshNavigationGrid();
  }, [refreshNavigationGrid]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new MutationObserver(() => {
      refreshNavigationGrid();
    });
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [containerRef, refreshNavigationGrid]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !visibleRange) {
      setMorePopoverOpenYmd(null);
      return;
    }

    const dayYmds = buildCalendarDayYmdsInRange(
      visibleRange.start,
      visibleRange.end,
    );

    const syncMorePopoverOpenYmd = () => {
      setMorePopoverOpenYmd(
        findOpenCalendarMorePopoverYmd(container, dayYmds),
      );
      if (highlightedIdRef.current) {
        applyCalendarGridKeyboardHighlight(
          container,
          highlightedIdRef.current,
        );
      }
    };

    syncMorePopoverOpenYmd();

    const observer = new MutationObserver(syncMorePopoverOpenYmd);
    observer.observe(container, { childList: true, subtree: true });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [containerRef, visibleRange]);

  const itemIds = navItemIds;

  const resolveNextItemId = useCallback(
    ({
      key,
      currentId,
    }: {
      key: string;
      currentId: string | null;
      itemIds: string[];
    }) => {
      if (!visibleRange) return null;
      return resolveCalendarGridKeyboardNextItemId({
        key,
        currentId,
        events,
        rangeStart: visibleRange.start,
        rangeEnd: visibleRange.end,
        viewMode,
        container: containerRef.current,
      });
    },
    [containerRef, events, viewMode, visibleRange],
  );

  const { highlightedId, setHighlightedId } = useListKeyboardNavigation({
    containerRef,
    itemIds,
    selectedId: selectedEventId,
    defaultHighlightedId:
      selectedEventId == null
        ? getCalendarMainKeyboardHighlightId()
        : null,
    onNavigate: (eventId) => {
      setCalendarMainKeyboardHighlightId(eventId);
      const moreYmd = parseCalendarMoreLinkItemId(eventId);
      if (moreYmd) {
        const container = containerRef.current;
        if (!container) return;

        const moreLink = container.querySelector<HTMLElement>(
          `.fc-daygrid-day[data-date="${CSS.escape(moreYmd)}"] .fc-daygrid-more-link`,
        );
        if (moreLink) {
          activateCalendarMoreLink(moreLink);
        }

        const focusFirstPopoverItem = (firstId: string | null) => {
          if (firstId) {
            setHighlightedId(firstId);
          }
        };

        waitForCalendarMorePopover(container, moreYmd, focusFirstPopoverItem);
        return;
      }

      onActivateEvent?.(eventId);
    },
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: enabled && itemIds.length > 0,
    resolveNextItemId,
  });

  const handleDismissMorePopover = useCallback(() => {
    const container = containerRef.current;
    if (!container || !morePopoverOpenYmd) return;

    closeCalendarMorePopoverForDay(container, morePopoverOpenYmd);
    setHighlightedId(calendarMoreLinkItemId(morePopoverOpenYmd));
  }, [containerRef, morePopoverOpenYmd, setHighlightedId]);

  useListDismissDetailShortcut({
    enabled: enabled && morePopoverOpenYmd != null,
    onDismiss: handleDismissMorePopover,
  });

  highlightedIdRef.current = highlightedId;

  useEffect(() => {
    if (highlightedId) {
      setCalendarMainKeyboardHighlightId(highlightedId);
    }
  }, [highlightedId]);

  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    applyCalendarGridKeyboardHighlight(container, highlightedId);
  }, [
    containerRef,
    highlightedId,
    navItemIds,
    events,
    visibleRange,
    viewMode,
    morePopoverOpenYmd,
  ]);

  const handleEventDidMount = useCallback(
    (info: EventMountArg) => {
      if (info.event.display === "background") return;
      info.el.setAttribute(CALENDAR_GRID_KEYBOARD_ITEM_ATTR, info.event.id);
      const container = containerRef.current;
      if (
        info.event.id === highlightedIdRef.current &&
        container &&
        findCalendarKeyboardHighlightTarget(container, info.event.id) ===
          info.el
      ) {
        info.el.classList.add(CALENDAR_GRID_KEYBOARD_HIGHLIGHT_CLASS);
        info.el
          .closest<HTMLElement>(
            ".fc-timegrid-event-harness, .fc-daygrid-event-harness",
          )
          ?.classList.add(CALENDAR_GRID_KEYBOARD_HIGHLIGHT_CLASS);
      }
    },
    [containerRef],
  );

  const handleEventWillUnmount = useCallback((info: EventMountArg) => {
    info.el.removeAttribute(CALENDAR_GRID_KEYBOARD_ITEM_ATTR);
    info.el.classList.remove(CALENDAR_GRID_KEYBOARD_HIGHLIGHT_CLASS);
    info.el
      .closest<HTMLElement>(".fc-timegrid-event-harness, .fc-daygrid-event-harness")
      ?.classList.remove(CALENDAR_GRID_KEYBOARD_HIGHLIGHT_CLASS);
  }, []);

  return {
    highlightedId,
    listContainerProps,
    handleEventDidMount,
    handleEventWillUnmount,
  };
}

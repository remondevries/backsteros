import { parseCalendarTaskOverlayId } from "./calendar-task-overlay.js";
import { parseCalendarMeetingOverlayId } from "../meetings/meetings.js";
import {
  boardKeyboardNavDirection,
  stepBoardTaskId,
} from "../list-nav/board-keyboard-nav.js";
import { formatLocalYmd } from "../tasks/task-due-date.js";
import type { TaskCalendarEvent } from "./calendar-events.js";
import type { CalendarViewMode } from "./calendar-view-modes.js";

export const CALENDAR_GRID_KEYBOARD_ITEM_ATTR = "data-calendar-keyboard-nav-item";
export const CALENDAR_GRID_KEYBOARD_HIGHLIGHT_CLASS = "keyboard-nav-item-highlight";
export const CALENDAR_MORE_LINK_PREFIX = "more:";

export function calendarMoreLinkItemId(ymd: string): string {
  return `${CALENDAR_MORE_LINK_PREFIX}${ymd}`;
}

export function parseCalendarMoreLinkItemId(itemId: string): string | null {
  if (!itemId.startsWith(CALENDAR_MORE_LINK_PREFIX)) return null;
  const ymd = itemId.slice(CALENDAR_MORE_LINK_PREFIX.length);
  return ymd || null;
}

function toValidDate(
  value: string | number | Date | null | undefined,
): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getSelectedCalendarGridEventId(
  pathname: string,
  search: string,
): string | null {
  const taskMatch = pathname.match(/^\/calendar\/tasks\/([^/]+)/);
  if (taskMatch?.[1]) {
    return decodeURIComponent(taskMatch[1]);
  }

  const taskOverlayId = parseCalendarTaskOverlayId(search);
  if (taskOverlayId) {
    return taskOverlayId;
  }

  const meetingId = parseCalendarMeetingOverlayId(search);
  if (meetingId) {
    return `meeting:${meetingId}`;
  }

  return null;
}

export function getCalendarEventDayYmd(event: TaskCalendarEvent): string | null {
  if (event.allDay && typeof event.start === "string") {
    return event.start.slice(0, 10);
  }
  const start = toValidDate(event.start);
  return start ? formatLocalYmd(start) : null;
}

export function buildCalendarDayYmdsInRange(
  rangeStart: Date,
  rangeEnd: Date,
): string[] {
  const dayMs = 24 * 60 * 60 * 1000;
  const ymds: string[] = [];
  const cursor = new Date(rangeStart);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(rangeEnd);
  end.setHours(0, 0, 0, 0);

  while (cursor < end) {
    ymds.push(formatLocalYmd(cursor));
    cursor.setTime(cursor.getTime() + dayMs);
  }

  return ymds;
}

export function buildCalendarEventKeyboardGrid(
  events: readonly TaskCalendarEvent[],
  rangeStart: Date,
  rangeEnd: Date,
): string[][] {
  const dayYmds = buildCalendarDayYmdsInRange(rangeStart, rangeEnd);
  const daySet = new Set(dayYmds);
  const byDay = new Map<string, TaskCalendarEvent[]>();

  for (const event of events) {
    const ymd = getCalendarEventDayYmd(event);
    if (!ymd || !daySet.has(ymd)) continue;
    const list = byDay.get(ymd) ?? [];
    list.push(event);
    byDay.set(ymd, list);
  }

  return dayYmds.map((ymd) => {
    const dayEvents = byDay.get(ymd) ?? [];
    dayEvents.sort((left, right) => {
      if (left.allDay !== right.allDay) {
        return left.allDay ? -1 : 1;
      }
      const leftStart = toValidDate(left.start)?.getTime() ?? 0;
      const rightStart = toValidDate(right.start)?.getTime() ?? 0;
      if (leftStart !== rightStart) {
        return leftStart - rightStart;
      }
      return left.id.localeCompare(right.id);
    });
    return dayEvents.map((event) => event.id);
  });
}

export function flattenCalendarEventKeyboardGrid(grid: string[][]): string[] {
  return grid.flat();
}

/** Linear keyboard order for one day column. */
export function buildCalendarDayColumnNavIds(input: {
  visibleAllDayIds: readonly string[];
  moreLinkYmd: string | null;
  popoverAllDayIds: readonly string[];
  popoverOpen: boolean;
  timedIds: readonly string[];
}): string[] {
  if (input.popoverOpen) {
    return [...input.popoverAllDayIds, ...input.timedIds];
  }

  return [
    ...input.visibleAllDayIds,
    ...(input.moreLinkYmd ? [calendarMoreLinkItemId(input.moreLinkYmd)] : []),
    ...input.timedIds,
  ];
}

function normalizeDomDayYmd(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const ymdMatch = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  if (ymdMatch) return ymdMatch[1]!;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatLocalYmd(parsed);
}

function isRenderableCalendarNavElement(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isVisibleDaygridEventHarness(harness: HTMLElement): boolean {
  if (!isRenderableCalendarNavElement(harness)) return false;

  const harnessStyle = window.getComputedStyle(harness);
  if (
    harnessStyle.visibility === "hidden" ||
    harnessStyle.display === "none" ||
    harnessStyle.opacity === "0"
  ) {
    return false;
  }

  const event = harness.querySelector<HTMLElement>(".fc-daygrid-event");
  if (event) {
    const eventStyle = window.getComputedStyle(event);
    if (
      eventStyle.visibility === "hidden" ||
      eventStyle.display === "none" ||
      eventStyle.opacity === "0"
    ) {
      return false;
    }
  }

  return true;
}

function isVisibleCalendarKeyboardNavElement(element: HTMLElement): boolean {
  if (!isRenderableCalendarNavElement(element)) return false;

  const style = window.getComputedStyle(element);
  if (
    style.visibility === "hidden" ||
    style.display === "none" ||
    style.opacity === "0"
  ) {
    return false;
  }

  const harness = element.closest<HTMLElement>(".fc-daygrid-event-harness");
  if (harness && !isVisibleDaygridEventHarness(harness)) {
    return false;
  }

  return true;
}

function calendarKeyboardNavSearchRoots(container: HTMLElement): HTMLElement[] {
  return container === document.body ? [container] : [container, document.body];
}

export function clearCalendarGridKeyboardHighlights(container: HTMLElement): void {
  for (const root of calendarKeyboardNavSearchRoots(container)) {
    root
      .querySelectorAll<HTMLElement>(
        `[${CALENDAR_GRID_KEYBOARD_ITEM_ATTR}]`,
      )
      .forEach((element) => {
        element.classList.remove(CALENDAR_GRID_KEYBOARD_HIGHLIGHT_CLASS);
        element
          .closest<HTMLElement>(".fc-timegrid-event-harness, .fc-daygrid-event-harness")
          ?.classList.remove(CALENDAR_GRID_KEYBOARD_HIGHLIGHT_CLASS);
      });
    root
      .querySelectorAll<HTMLElement>(".fc-daygrid-more-link")
      .forEach((element) => {
        element.classList.remove(CALENDAR_GRID_KEYBOARD_HIGHLIGHT_CLASS);
      });
  }
}

export function findCalendarKeyboardHighlightTarget(
  container: HTMLElement,
  highlightedId: string,
): HTMLElement | null {
  const moreYmd = parseCalendarMoreLinkItemId(highlightedId);
  if (moreYmd) {
    return container.querySelector<HTMLElement>(
      `.fc-daygrid-day[data-date="${CSS.escape(moreYmd)}"] .fc-daygrid-more-link`,
    );
  }

  const matches: HTMLElement[] = [];
  for (const root of calendarKeyboardNavSearchRoots(container)) {
    root
      .querySelectorAll<HTMLElement>(
        `[${CALENDAR_GRID_KEYBOARD_ITEM_ATTR}="${CSS.escape(highlightedId)}"]`,
      )
      .forEach((element) => {
        if (!matches.includes(element)) {
          matches.push(element);
        }
      });
  }

  const visible = matches.filter(isVisibleCalendarKeyboardNavElement);
  if (visible.length === 0) {
    return matches[0] ?? null;
  }

  const popoverMatch = visible.find((element) =>
    element.closest(".fc-popover, .fc-more-popover"),
  );
  return popoverMatch ?? visible[0] ?? null;
}

export function applyCalendarGridKeyboardHighlight(
  container: HTMLElement,
  highlightedId: string | null,
): void {
  clearCalendarGridKeyboardHighlights(container);
  if (!highlightedId) return;

  const moreYmd = parseCalendarMoreLinkItemId(highlightedId);
  if (moreYmd) {
    const moreLink = container.querySelector<HTMLElement>(
      `.fc-daygrid-day[data-date="${CSS.escape(moreYmd)}"] .fc-daygrid-more-link`,
    );
    if (!moreLink) return;
    moreLink.classList.add(CALENDAR_GRID_KEYBOARD_HIGHLIGHT_CLASS);
    moreLink.scrollIntoView({ block: "nearest", inline: "nearest" });
    return;
  }

  const target = findCalendarKeyboardHighlightTarget(container, highlightedId);
  if (!target) return;

  target.classList.add(CALENDAR_GRID_KEYBOARD_HIGHLIGHT_CLASS);
  target
    .closest<HTMLElement>(".fc-timegrid-event-harness, .fc-daygrid-event-harness")
    ?.classList.add(CALENDAR_GRID_KEYBOARD_HIGHLIGHT_CLASS);

  const scrollRoot =
    target.closest<HTMLElement>(".fc-more-popover, .fc-popover") ?? target;
  scrollRoot.scrollIntoView({ block: "nearest", inline: "nearest" });
}

export function findOpenCalendarMorePopoverForDay(
  container: HTMLElement,
  ymd: string,
): HTMLElement | null {
  const dayCell = container.querySelector<HTMLElement>(
    `.fc-daygrid-day[data-date="${CSS.escape(ymd)}"]`,
  );
  const moreLink = dayCell?.querySelector<HTMLElement>(".fc-daygrid-more-link");
  const moreLinkCenterX = moreLink
    ? moreLink.getBoundingClientRect().left + moreLink.getBoundingClientRect().width / 2
    : null;

  const roots =
    container === document.body ? [container] : [container, document.body];

  for (const root of roots) {
    for (const popover of root.querySelectorAll<HTMLElement>(".fc-popover")) {
      if (!isRenderableCalendarNavElement(popover)) continue;

      const popoverYmd = normalizeDomDayYmd(
        popover
          .querySelector<HTMLElement>(".fc-daygrid-day[data-date], [data-date]")
          ?.getAttribute("data-date"),
      );
      if (popoverYmd === ymd) {
        return popover;
      }

      if (moreLinkCenterX != null) {
        const popoverRect = popover.getBoundingClientRect();
        if (
          popoverRect.left <= moreLinkCenterX &&
          moreLinkCenterX <= popoverRect.right
        ) {
          return popover;
        }
      }
    }
  }
  return null;
}

export function findOpenCalendarMorePopoverYmd(
  container: HTMLElement,
  dayYmds: readonly string[],
): string | null {
  for (const ymd of dayYmds) {
    if (findOpenCalendarMorePopoverForDay(container, ymd)) {
      return ymd;
    }
  }
  return null;
}

export function closeCalendarMorePopoverForDay(
  container: HTMLElement,
  ymd: string,
): boolean {
  const popover = findOpenCalendarMorePopoverForDay(container, ymd);
  if (!popover) return false;

  const closeButton = popover.querySelector<HTMLElement>(".fc-popover-close");
  if (closeButton) {
    closeButton.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, view: window }),
    );
    return true;
  }

  return false;
}

export function getFirstPopoverAllDayEventId(
  container: HTMLElement,
  ymd: string,
): string | null {
  const popover = findOpenCalendarMorePopoverForDay(container, ymd);
  if (!popover) return null;

  for (const element of popover.querySelectorAll<HTMLElement>(
    `.fc-daygrid-event[${CALENDAR_GRID_KEYBOARD_ITEM_ATTR}]`,
  )) {
    if (!isRenderableCalendarNavElement(element)) continue;
    return element.getAttribute(CALENDAR_GRID_KEYBOARD_ITEM_ATTR);
  }

  return null;
}

function collectVisibleMainRowAllDayEventIds(
  container: HTMLElement,
  ymd: string,
): string[] {
  const dayCell = container.querySelector<HTMLElement>(
    `.fc-daygrid-day[data-date="${CSS.escape(ymd)}"]`,
  );
  if (!dayCell) return [];

  const eventsRoot = dayCell.querySelector<HTMLElement>(
    ".fc-daygrid-day-events",
  );
  if (!eventsRoot) return [];

  const ids: string[] = [];
  for (const child of eventsRoot.children) {
    if (
      child instanceof HTMLElement &&
      child.classList.contains("fc-daygrid-day-bottom")
    ) {
      break;
    }
    if (
      !(
        child instanceof HTMLElement &&
        child.classList.contains("fc-daygrid-event-harness")
      )
    ) {
      continue;
    }

    if (!isVisibleDaygridEventHarness(child)) {
      continue;
    }

    const event = child.querySelector<HTMLElement>(
      `.fc-daygrid-event[${CALENDAR_GRID_KEYBOARD_ITEM_ATTR}]`,
    );
    if (!event) continue;

    const id = event.getAttribute(CALENDAR_GRID_KEYBOARD_ITEM_ATTR);
    if (!id || ids.includes(id)) continue;
    ids.push(id);
  }

  return ids;
}

function collectPopoverAllDayEventIds(
  container: HTMLElement,
  ymd: string,
): string[] {
  const popover = findOpenCalendarMorePopoverForDay(container, ymd);
  if (!popover) return [];

  const ids: string[] = [];
  popover
    .querySelectorAll<HTMLElement>(
      `.fc-daygrid-event[${CALENDAR_GRID_KEYBOARD_ITEM_ATTR}]`,
    )
    .forEach((element) => {
      if (!isRenderableCalendarNavElement(element)) return;
      const id = element.getAttribute(CALENDAR_GRID_KEYBOARD_ITEM_ATTR);
      if (!id || ids.includes(id)) return;
      ids.push(id);
    });
  return ids;
}

function collectTimedEventIdsForDay(
  container: HTMLElement,
  ymd: string,
  seen: Set<string>,
): string[] {
  const entries: Array<{ id: string; top: number }> = [];

  container
    .querySelectorAll<HTMLElement>(
      `.fc-timegrid-event[${CALENDAR_GRID_KEYBOARD_ITEM_ATTR}], .fc-timegrid-event-harness [${CALENDAR_GRID_KEYBOARD_ITEM_ATTR}]`,
    )
    .forEach((element) => {
      const eventElement = element.classList.contains("fc-timegrid-event")
        ? element
        : element.closest<HTMLElement>(".fc-timegrid-event");
      if (!eventElement || !isRenderableCalendarNavElement(eventElement)) return;

      const eventYmd = normalizeDomDayYmd(
        eventElement
          .closest<HTMLElement>(".fc-timegrid-col, [data-date]")
          ?.getAttribute("data-date"),
      );
      if (eventYmd !== ymd) return;

      const id = eventElement.getAttribute(CALENDAR_GRID_KEYBOARD_ITEM_ATTR);
      if (!id || seen.has(id)) return;
      seen.add(id);

      const harness = eventElement.closest<HTMLElement>(
        ".fc-timegrid-event-harness",
      );
      const top = harness?.style.top
        ? Number.parseFloat(harness.style.top)
        : entries.length;
      entries.push({ id, top });
    });

  entries.sort((left, right) => left.top - right.top);
  return entries.map((entry) => entry.id);
}

function dayHasMoreLink(container: HTMLElement, ymd: string): boolean {
  return Boolean(
    container.querySelector(
      `.fc-daygrid-day[data-date="${CSS.escape(ymd)}"] .fc-daygrid-more-link`,
    ),
  );
}

function collectDayColumnEventIdsFromDom(
  container: HTMLElement,
  ymd: string,
  viewMode: CalendarViewMode,
): string[] {
  const popoverOpen = findOpenCalendarMorePopoverForDay(container, ymd) != null;
  const visibleAllDayIds = collectVisibleMainRowAllDayEventIds(container, ymd);
  const popoverAllDayIds = popoverOpen
    ? collectPopoverAllDayEventIds(container, ymd)
    : [];
  const moreLinkYmd =
    !popoverOpen && dayHasMoreLink(container, ymd) ? ymd : null;

  const timedSeen = new Set<string>([
    ...visibleAllDayIds,
    ...popoverAllDayIds,
  ]);
  const timedIds =
    viewMode === "week" || viewMode === "day"
      ? collectTimedEventIdsForDay(container, ymd, timedSeen)
      : [];

  return buildCalendarDayColumnNavIds({
    visibleAllDayIds,
    moreLinkYmd,
    popoverAllDayIds,
    popoverOpen,
    timedIds,
  });
}

/**
 * Build a keyboard grid from mounted FullCalendar DOM nodes.
 * Each day column is: visible all-day rows → optional "+N more" → timed blocks.
 * When the overflow popover is open, j/k navigates that list, then timed blocks.
 */
export function buildCalendarEventKeyboardGridFromDom(
  container: HTMLElement,
  dayYmds: readonly string[],
  viewMode: CalendarViewMode,
): string[][] {
  if (viewMode === "list") {
    const ids: string[] = [];
    const seen = new Set<string>();
    container.querySelectorAll<HTMLElement>(".fc-list-event").forEach((element) => {
      const id = element.getAttribute(CALENDAR_GRID_KEYBOARD_ITEM_ATTR);
      if (!id || seen.has(id)) return;
      seen.add(id);
      ids.push(id);
    });
    return [ids];
  }

  return dayYmds.map((ymd) =>
    collectDayColumnEventIdsFromDom(container, ymd, viewMode),
  );
}

export function buildCalendarEventKeyboardGridForNavigation(input: {
  container?: HTMLElement | null;
  events: readonly TaskCalendarEvent[];
  rangeStart: Date;
  rangeEnd: Date;
  viewMode: CalendarViewMode;
}): string[][] {
  const dayYmds = buildCalendarDayYmdsInRange(input.rangeStart, input.rangeEnd);
  if (input.container) {
    return buildCalendarEventKeyboardGridFromDom(
      input.container,
      dayYmds,
      input.viewMode,
    );
  }
  return buildCalendarEventKeyboardGrid(
    input.events,
    input.rangeStart,
    input.rangeEnd,
  );
}

export function resolveCalendarGridKeyboardNextItemId(input: {
  key: string;
  currentId: string | null;
  events: readonly TaskCalendarEvent[];
  rangeStart: Date;
  rangeEnd: Date;
  viewMode: CalendarViewMode;
  container?: HTMLElement | null;
}): string | null {
  const direction = boardKeyboardNavDirection(input.key);
  if (!direction) return null;

  const grid = buildCalendarEventKeyboardGridForNavigation({
    container: input.container,
    events: input.events,
    rangeStart: input.rangeStart,
    rangeEnd: input.rangeEnd,
    viewMode: input.viewMode,
  });

  if (grid.every((column) => column.length === 0)) {
    return null;
  }

  const nextId = stepBoardTaskId(grid, input.currentId, direction);

  if (
    direction === "up" &&
    input.container &&
    input.currentId &&
    nextId === input.currentId
  ) {
    const dayYmds = buildCalendarDayYmdsInRange(
      input.rangeStart,
      input.rangeEnd,
    );
    for (const ymd of dayYmds) {
      if (!findOpenCalendarMorePopoverForDay(input.container, ymd)) continue;
      const popoverIds = collectPopoverAllDayEventIds(input.container, ymd);
      if (popoverIds[0] === input.currentId) {
        closeCalendarMorePopoverForDay(input.container, ymd);
        return calendarMoreLinkItemId(ymd);
      }
    }
  }

  return nextId;
}

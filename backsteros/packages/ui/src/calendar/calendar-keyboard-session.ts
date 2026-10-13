type CalendarKeyboardSession = {
  mainHighlightId: string | null;
  sidePanelHighlightId: string | null;
  activeZone: "main" | "sidepanel";
};

let calendarKeyboardSession: CalendarKeyboardSession = {
  mainHighlightId: null,
  sidePanelHighlightId: null,
  activeZone: "sidepanel",
};

export type CalendarKeyboardActiveZone =
  CalendarKeyboardSession["activeZone"];

export function getCalendarKeyboardActiveZone(): CalendarKeyboardActiveZone {
  return calendarKeyboardSession.activeZone;
}

export function setCalendarKeyboardActiveZone(
  zone: CalendarKeyboardActiveZone,
): void {
  calendarKeyboardSession = {
    ...calendarKeyboardSession,
    activeZone: zone,
  };
}

export function getCalendarMainKeyboardHighlightId(): string | null {
  return calendarKeyboardSession.mainHighlightId;
}

export function setCalendarMainKeyboardHighlightId(
  highlightId: string | null,
): void {
  calendarKeyboardSession = {
    ...calendarKeyboardSession,
    mainHighlightId: highlightId,
  };
}

export function getCalendarSidePanelKeyboardHighlightId(): string | null {
  return calendarKeyboardSession.sidePanelHighlightId;
}

export function setCalendarSidePanelKeyboardHighlightId(
  highlightId: string | null,
): void {
  calendarKeyboardSession = {
    ...calendarKeyboardSession,
    sidePanelHighlightId: highlightId,
  };
}

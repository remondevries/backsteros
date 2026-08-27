import { Calendar } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import timeGridPlugin from "@fullcalendar/timegrid";

type GridEvent = {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay?: boolean;
  backgroundColor?: string;
  borderColor?: string;
  classNames?: string[];
  extendedProps?: Record<string, unknown>;
};

type InitMessage = {
  type: "init";
  events: GridEvent[];
  viewMode: "month" | "day";
  selectedDate?: string;
  editable?: boolean;
};

type HostMessage =
  | { type: "ready" }
  | {
      type: "eventClick";
      taskId?: string;
      meetingId?: string;
      eventId: string;
    }
  | {
      type: "eventChange";
      entityType: "task" | "meeting";
      entityId: string;
      start: string;
      end: string | null;
      allDay: boolean;
    }
  | {
      type: "select";
      start: string;
      end: string;
      allDay: boolean;
    }
  | {
      type: "datesSet";
      title: string;
      start: string;
      end: string;
      viewType: string;
    };

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}

function post(message: HostMessage) {
  window.ReactNativeWebView?.postMessage(JSON.stringify(message));
}

function viewModeToFcView(mode: InitMessage["viewMode"]): string {
  if (mode === "month") return "dayGridMonth";
  return "timeGridDay";
}

function entityFromEvent(event: {
  id: string;
  extendedProps?: Record<string, unknown>;
}): { entityType: "task" | "meeting"; entityId: string } {
  const props = event.extendedProps ?? {};
  if (props.entityType === "meeting") {
    const meetingId = props.meetingId;
    if (typeof meetingId === "string" && meetingId) {
      return { entityType: "meeting", entityId: meetingId };
    }
  }
  const taskId = props.taskId;
  return {
    entityType: "task",
    entityId: typeof taskId === "string" && taskId ? taskId : event.id,
  };
}

let calendar: Calendar | null = null;

function destroyCalendar() {
  calendar?.destroy();
  calendar = null;
}

function mountCalendar(payload: InitMessage) {
  const el = document.getElementById("calendar");
  if (!el) return;
  destroyCalendar();
  calendar = new Calendar(el, {
    plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
    initialView: viewModeToFcView(payload.viewMode),
    initialDate: payload.selectedDate,
    headerToolbar: false,
    height: "100%",
    editable: payload.editable !== false,
    selectable: true,
    selectMirror: true,
    nowIndicator: true,
    events: payload.events,
    eventClick(info) {
      const entity = entityFromEvent(info.event);
      post({
        type: "eventClick",
        eventId: info.event.id,
        ...(entity.entityType === "meeting"
          ? { meetingId: entity.entityId }
          : { taskId: entity.entityId }),
      });
    },
    eventDrop(info) {
      const entity = entityFromEvent(info.event);
      post({
        type: "eventChange",
        entityType: entity.entityType,
        entityId: entity.entityId,
        start: info.event.start?.toISOString() ?? "",
        end: info.event.end?.toISOString() ?? null,
        allDay: info.event.allDay,
      });
    },
    eventResize(info) {
      const entity = entityFromEvent(info.event);
      post({
        type: "eventChange",
        entityType: entity.entityType,
        entityId: entity.entityId,
        start: info.event.start?.toISOString() ?? "",
        end: info.event.end?.toISOString() ?? null,
        allDay: info.event.allDay,
      });
    },
    select(info) {
      if (!info.start) return;
      post({
        type: "select",
        start: info.start.toISOString(),
        end: (info.end ?? info.start).toISOString(),
        allDay: info.allDay,
      });
      calendar?.unselect();
    },
    datesSet(info) {
      post({
        type: "datesSet",
        title: info.view.title,
        start: info.start.toISOString(),
        end: info.end.toISOString(),
        viewType: info.view.type,
      });
    },
  });
  calendar.render();
}

function handleHostMessage(raw: string) {
  let message: InitMessage & { type: string };
  try {
    message = JSON.parse(raw) as InitMessage & { type: string };
  } catch {
    return;
  }
  if (message.type === "init") {
    mountCalendar(message);
    return;
  }
  if (message.type === "changeView" && calendar) {
    const mode = (message as { viewMode?: InitMessage["viewMode"] }).viewMode;
    if (mode) calendar.changeView(viewModeToFcView(mode));
    return;
  }
  if (message.type === "gotoDate" && calendar) {
    const date = (message as { date?: string }).date;
    if (date) calendar.gotoDate(date);
  }
}

window.addEventListener("message", (event) => {
  if (typeof event.data === "string") {
    handleHostMessage(event.data);
  }
});

document.addEventListener("message", (event) => {
  const data = (event as MessageEvent).data;
  if (typeof data === "string") {
    handleHostMessage(data);
  }
});

post({ type: "ready" });

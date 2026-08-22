"use client";

import type { DayCellMountArg, DayHeaderMountArg } from "@fullcalendar/core";
import { useCallback, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import { formatLocalYmd } from "../tasks/task-due-date.js";
import {
  CalendarHabitsIconRow,
  type CalendarHabitIconItem,
} from "./calendar-habits-icon-row.js";

type MountEntry = {
  root: Root;
  slot: HTMLElement;
};

function cellKey(viewType: string, ymd: string): string {
  return `${viewType}:${ymd}`;
}

function ensureHabitSlot(
  anchor: HTMLElement,
  position: "month-cell" | "header" | "list-day",
): HTMLElement {
  const existing = anchor.querySelector(
    ".calendar-day-habits-slot",
  ) as HTMLElement | null;
  if (existing) return existing;

  const slot = document.createElement("div");
  slot.className = "calendar-day-habits-slot";

  if (position === "month-cell") {
    const events = anchor.querySelector(".fc-daygrid-day-events");
    if (events) {
      anchor.insertBefore(slot, events);
    } else {
      anchor.appendChild(slot);
    }
    return slot;
  }

  if (position === "list-day") {
    anchor.appendChild(slot);
    return slot;
  }

  const inner =
    (anchor.querySelector(".fc-scrollgrid-sync-inner") as HTMLElement | null) ??
    anchor;
  inner.appendChild(slot);
  return slot;
}

export function useCalendarDayHabitMounts(
  habitsByDate: ReadonlyMap<string, readonly CalendarHabitIconItem[]>,
  onToggle?: (item: CalendarHabitIconItem, completed: boolean) => void,
) {
  const mountsRef = useRef(new Map<string, MountEntry>());
  const habitsByDateRef = useRef(habitsByDate);
  const onToggleRef = useRef(onToggle);

  habitsByDateRef.current = habitsByDate;
  onToggleRef.current = onToggle;

  const renderSlot = useCallback((key: string, slot: HTMLElement, ymd: string) => {
    const items = habitsByDateRef.current.get(ymd) ?? [];
    let entry = mountsRef.current.get(key);
    if (!entry) {
      const root = createRoot(slot);
      entry = { root, slot };
      mountsRef.current.set(key, entry);
    }
    entry.root.render(
      <CalendarHabitsIconRow
        items={items}
        onToggle={(item, completed) => onToggleRef.current?.(item, completed)}
      />,
    );
  }, []);

  const unmountKey = useCallback((key: string) => {
    const entry = mountsRef.current.get(key);
    if (!entry) return;
    entry.root.unmount();
    mountsRef.current.delete(key);
  }, []);

  useEffect(() => {
    for (const [key, entry] of mountsRef.current) {
      const ymd = key.split(":").slice(1).join(":");
      renderSlot(key, entry.slot, ymd);
    }
  }, [habitsByDate, onToggle, renderSlot]);

  useEffect(() => {
    const mounts = mountsRef.current;
    return () => {
      for (const key of mounts.keys()) {
        const entry = mounts.get(key);
        if (entry) entry.root.unmount();
      }
      mounts.clear();
    };
  }, []);

  const syncListDayHabits = useCallback(
    (container: HTMLElement | null) => {
      if (!container) return;
      const rows = container.querySelectorAll<HTMLElement>(
        "tr.fc-list-day[data-date]",
      );
      for (const row of rows) {
        const ymd = row.getAttribute("data-date")?.trim();
        if (!ymd) continue;
        const cushion = row.querySelector(
          "th.fc-list-day-cushion",
        ) as HTMLElement | null;
        if (!cushion) continue;
        const key = cellKey("listWeek", ymd);
        const slot = ensureHabitSlot(cushion, "list-day");
        renderSlot(key, slot, ymd);
      }
    },
    [renderSlot],
  );

  const dayCellDidMount = useCallback(
    (info: DayCellMountArg) => {
      if (info.view.type !== "dayGridMonth") return;
      const ymd = formatLocalYmd(info.date);
      const frame = info.el.querySelector(
        ".fc-daygrid-day-frame",
      ) as HTMLElement | null;
      if (!frame) return;
      const key = cellKey(info.view.type, ymd);
      const slot = ensureHabitSlot(frame, "month-cell");
      renderSlot(key, slot, ymd);
    },
    [renderSlot],
  );

  const dayCellWillUnmount = useCallback(
    (info: DayCellMountArg) => {
      if (info.view.type !== "dayGridMonth") return;
      unmountKey(cellKey(info.view.type, formatLocalYmd(info.date)));
    },
    [unmountKey],
  );

  const dayHeaderDidMount = useCallback(
    (info: DayHeaderMountArg) => {
      if (
        info.view.type !== "timeGridWeek" &&
        info.view.type !== "timeGridDay"
      ) {
        return;
      }
      const ymd = formatLocalYmd(info.date);
      const key = cellKey(info.view.type, ymd);
      const slot = ensureHabitSlot(info.el, "header");
      renderSlot(key, slot, ymd);
    },
    [renderSlot],
  );

  const dayHeaderWillUnmount = useCallback(
    (info: DayHeaderMountArg) => {
      if (
        info.view.type !== "timeGridWeek" &&
        info.view.type !== "timeGridDay"
      ) {
        return;
      }
      unmountKey(cellKey(info.view.type, formatLocalYmd(info.date)));
    },
    [unmountKey],
  );

  return {
    dayCellDidMount,
    dayCellWillUnmount,
    dayHeaderDidMount,
    dayHeaderWillUnmount,
    syncListDayHabits,
  };
}

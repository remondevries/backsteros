import type {
  MeetingWeekdayHoursEntry,
  MeetingWeekdayHoursSlot,
} from "@backsteros/contracts";

export const DEFAULT_WEEKDAY_SLOT: MeetingWeekdayHoursSlot = {
  start: "09:00",
  end: "17:00",
};

export function formatTime12h(value: string): string {
  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  const period = hours >= 12 ? "pm" : "am";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, "0")}${period}`;
}

export function formatSlotLabel(slot: MeetingWeekdayHoursSlot): string {
  return `${formatTime12h(slot.start)} – ${formatTime12h(slot.end)}`;
}

export function formatWeekdaySlotsLabel(entry: MeetingWeekdayHoursEntry): string {
  return entry.slots.map((slot) => formatSlotLabel(slot)).join(", ");
}

export function patchWeekdayHoursEntry(
  weekdayHours: MeetingWeekdayHoursEntry[],
  weekday: number,
  patch: Partial<Pick<MeetingWeekdayHoursEntry, "enabled" | "slots">>,
): MeetingWeekdayHoursEntry[] {
  return weekdayHours.map((entry) => {
    if (entry.weekday !== weekday) return entry;
    const next = { ...entry, ...patch };
    if (
      patch.slots != null &&
      patch.slots.length > 0 &&
      patch.enabled === undefined
    ) {
      next.enabled = true;
    }
    return next;
  });
}

export function updateWeekdaySlot(
  weekdayHours: MeetingWeekdayHoursEntry[],
  weekday: number,
  slotIndex: number,
  patch: Partial<MeetingWeekdayHoursSlot>,
): MeetingWeekdayHoursEntry[] {
  return weekdayHours.map((entry) => {
    if (entry.weekday !== weekday) return entry;
    const slots = entry.slots.map((slot, index) =>
      index === slotIndex ? { ...slot, ...patch } : slot,
    );
    return { ...entry, slots };
  });
}

export function addWeekdaySlot(
  weekdayHours: MeetingWeekdayHoursEntry[],
  weekday: number,
): MeetingWeekdayHoursEntry[] {
  return weekdayHours.map((entry) => {
    if (entry.weekday !== weekday) return entry;
    const nextSlot = suggestNextSlot(entry.slots);
    return { ...entry, enabled: true, slots: [...entry.slots, nextSlot] };
  });
}

export function removeWeekdaySlot(
  weekdayHours: MeetingWeekdayHoursEntry[],
  weekday: number,
  slotIndex: number,
): MeetingWeekdayHoursEntry[] {
  return weekdayHours.map((entry) => {
    if (entry.weekday !== weekday) return entry;
    if (entry.slots.length <= 1) {
      return { ...entry, enabled: false };
    }
    return {
      ...entry,
      slots: entry.slots.filter((_, index) => index !== slotIndex),
    };
  });
}

export function suggestNextSlot(
  slots: MeetingWeekdayHoursSlot[],
): MeetingWeekdayHoursSlot {
  const last = slots[slots.length - 1];
  if (!last) return { ...DEFAULT_WEEKDAY_SLOT };
  if (last.end < "17:00") {
    return { start: last.end, end: "17:00" };
  }
  return { start: "09:00", end: "12:00" };
}

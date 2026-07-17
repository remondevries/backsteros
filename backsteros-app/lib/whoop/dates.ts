import { getWhoopTimezone } from "@/lib/whoop/config";

export function formatDateInTimezone(timezone: string, date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function resolveDailyNoteInfo(options: {
  timezone?: string;
  now?: Date;
  date?: string;
} = {}) {
  const timezone = options.timezone ?? getWhoopTimezone();
  const now = options.now ?? new Date();
  const date = options.date ?? formatDateInTimezone(timezone, now);

  return {
    timezone,
    date,
  };
}

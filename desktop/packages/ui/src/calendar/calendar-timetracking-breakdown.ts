import type { TimetrackingEntry } from "./calendar-timetracking-entries.js";

export type TimetrackingBreakdownSlice = {
  id: string;
  label: string;
  /** Seconds attributed to this slice. */
  seconds: number;
  color: string;
};

/** Palette aligned with the productivity-metrics mock (teal → lavender → indigo → gray + extras). */
export const TIMETRACKING_BREAKDOWN_COLORS = [
  "#2dd4bf",
  "#c4b5fd",
  "#6366f1",
  "#9ca3af",
  "#3b82f6",
  "#f472b6",
  "#fbbf24",
  "#34d399",
  "#fb7185",
  "#a78bfa",
] as const;

const NO_PROJECT_ID = "__none__";
const NO_AREA_ID = "__none__";

/**
 * Human duration for breakdown legends — e.g. `2hr 11 min`, `56 min`.
 */
export function formatTimetrackingHumanDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours}hr`;
  return `${hours}hr ${minutes} min`;
}

function colorForIndex(index: number): string {
  return TIMETRACKING_BREAKDOWN_COLORS[
    index % TIMETRACKING_BREAKDOWN_COLORS.length
  ]!;
}

function normalizeCssColor(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed;
}

/**
 * Hours grouped by project for the Projects pie.
 * Entries without a project land in "No project".
 */
export function buildTimetrackingProjectBreakdown(
  entries: readonly TimetrackingEntry[],
): TimetrackingBreakdownSlice[] {
  const buckets = new Map<
    string,
    { label: string; seconds: number; order: number }
  >();

  for (const entry of entries) {
    const seconds = Math.max(0, entry.trackedDurationSeconds);
    if (seconds <= 0) continue;
    const key =
      entry.projectId?.trim() ||
      entry.projectKey?.trim() ||
      NO_PROJECT_ID;
    const label =
      key === NO_PROJECT_ID
        ? "No project"
        : entry.projectName?.trim() ||
          entry.projectKey?.trim() ||
          "Untitled project";
    const existing = buckets.get(key);
    if (existing) {
      existing.seconds += seconds;
    } else {
      buckets.set(key, { label, seconds, order: buckets.size });
    }
  }

  return [...buckets.entries()]
    .map(([id, bucket]) => ({
      id,
      label: bucket.label,
      seconds: bucket.seconds,
      color: colorForIndex(bucket.order),
    }))
    .sort((a, b) => b.seconds - a.seconds || a.label.localeCompare(b.label));
}

/**
 * Hours grouped by Area (via each entry's project → nested area, or top-level
 * personal / business / clients). Entries without an area land in "No area".
 */
export function buildTimetrackingAreaBreakdown(
  entries: readonly TimetrackingEntry[],
): TimetrackingBreakdownSlice[] {
  const buckets = new Map<
    string,
    { label: string; seconds: number; order: number; color: string | null }
  >();

  for (const entry of entries) {
    const seconds = Math.max(0, entry.trackedDurationSeconds);
    if (seconds <= 0) continue;
    const key = entry.areaId?.trim() || NO_AREA_ID;
    const label =
      key === NO_AREA_ID
        ? "No area"
        : entry.areaName?.trim() || "Untitled area";
    const existing = buckets.get(key);
    if (existing) {
      existing.seconds += seconds;
      if (!existing.color) {
        existing.color = normalizeCssColor(entry.areaColor);
      }
    } else {
      buckets.set(key, {
        label,
        seconds,
        order: buckets.size,
        color: normalizeCssColor(entry.areaColor),
      });
    }
  }

  return [...buckets.entries()]
    .map(([id, bucket]) => ({
      id,
      label: bucket.label,
      seconds: bucket.seconds,
      color: bucket.color ?? colorForIndex(bucket.order),
    }))
    .sort((a, b) => b.seconds - a.seconds || a.label.localeCompare(b.label));
}

/**
 * Time attributed to Related contacts (tasks) / attendees (meetings).
 * Splits each entry's tracked seconds equally across its related contact ids
 * so period totals stay consistent.
 */
function readContactName(
  contactNames: ReadonlyMap<string, string> | Record<string, string>,
  id: string,
): string | undefined {
  if (contactNames instanceof Map) return contactNames.get(id);
  return (contactNames as Record<string, string>)[id];
}

export function buildTimetrackingContactBreakdown(
  entries: readonly TimetrackingEntry[],
  contactNames: ReadonlyMap<string, string> | Record<string, string>,
): TimetrackingBreakdownSlice[] {
  const nameOf = (id: string): string =>
    readContactName(contactNames, id)?.trim() || "Unknown contact";

  const buckets = new Map<string, { label: string; seconds: number; order: number }>();

  for (const entry of entries) {
    const seconds = Math.max(0, entry.trackedDurationSeconds);
    if (seconds <= 0) continue;
    const contacts = entry.relatedContactIds ?? [];
    if (contacts.length === 0) continue;
    const share = seconds / contacts.length;
    for (const contactId of contacts) {
      const existing = buckets.get(contactId);
      if (existing) {
        existing.seconds += share;
      } else {
        buckets.set(contactId, {
          label: nameOf(contactId),
          seconds: share,
          order: buckets.size,
        });
      }
    }
  }

  return [...buckets.entries()]
    .map(([id, bucket]) => ({
      id,
      label: bucket.label,
      seconds: bucket.seconds,
      color: colorForIndex(bucket.order),
    }))
    .sort((a, b) => b.seconds - a.seconds || a.label.localeCompare(b.label));
}

export function sumBreakdownSeconds(
  slices: readonly TimetrackingBreakdownSlice[],
): number {
  return slices.reduce((sum, slice) => sum + slice.seconds, 0);
}

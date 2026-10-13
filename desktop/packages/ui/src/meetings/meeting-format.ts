export const MEETING_FORMATS = [
  "in_person",
  "video_call",
  "phone_call",
] as const;

export type MeetingFormat = (typeof MEETING_FORMATS)[number];

export const DEFAULT_MEETING_FORMAT: MeetingFormat = "video_call";

export function isMeetingFormat(value: unknown): value is MeetingFormat {
  return (
    typeof value === "string" &&
    (MEETING_FORMATS as readonly string[]).includes(value)
  );
}

export function normalizeMeetingFormat(value: unknown): MeetingFormat {
  return isMeetingFormat(value) ? value : DEFAULT_MEETING_FORMAT;
}

export function getMeetingFormatLabel(format: MeetingFormat): string {
  switch (format) {
    case "in_person":
      return "In person";
    case "video_call":
      return "Video call";
    case "phone_call":
      return "Phone call";
    default:
      return getMeetingFormatLabel(DEFAULT_MEETING_FORMAT);
  }
}

export const MEETING_FORMAT_OPTIONS: ReadonlyArray<{
  value: MeetingFormat;
  label: string;
}> = [
  { value: "video_call", label: "Video call" },
  { value: "phone_call", label: "Phone call" },
  { value: "in_person", label: "In person" },
];

/** @deprecated Use MEETING_FORMAT_OPTIONS */
export const MEETING_FORMAT_TOGGLE_OPTIONS = MEETING_FORMAT_OPTIONS;

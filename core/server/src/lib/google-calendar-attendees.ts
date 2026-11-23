import {
  getContactEmailAddresses,
  parseBareEmailAddress,
} from "@backsteros/contracts";

import type { GoogleCalendarAttendee } from "./google-calendar-client.js";

export function primaryEmailForContact(contact: {
  email?: string | null;
  emails?: unknown;
}): string | null {
  for (const entry of getContactEmailAddresses({
    email: contact.email,
    emails: contact.emails as
      | { label: string; address: string }[]
      | string
      | null,
  })) {
    const bare = parseBareEmailAddress(entry);
    if (bare.includes("@")) return bare;
  }
  return null;
}

export function attendeesFromRaw(raw: unknown): GoogleCalendarAttendee[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const list = (raw as { attendees?: unknown }).attendees;
  if (!Array.isArray(list)) return [];
  const out: GoogleCalendarAttendee[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const email = parseBareEmailAddress(
      typeof (entry as { email?: unknown }).email === "string"
        ? (entry as { email: string }).email
        : "",
    );
    if (!email.includes("@")) continue;
    out.push({ ...(entry as GoogleCalendarAttendee), email });
  }
  return out;
}

/**
 * Merge Backster-managed guest emails into a Google attendee list.
 * Guests that were only on Google (never in the previous Backster set) are kept.
 * Removed Backster contacts drop off; newly added ones are appended.
 */
export function mergeGoogleAttendees(input: {
  existing: readonly GoogleCalendarAttendee[];
  previousBacksterEmails: readonly string[];
  nextBacksterEmails: readonly string[];
}): GoogleCalendarAttendee[] {
  const previous = new Set(
    input.previousBacksterEmails.map((email) => parseBareEmailAddress(email)),
  );
  const next = [
    ...new Set(
      input.nextBacksterEmails
        .map((email) => parseBareEmailAddress(email))
        .filter((email) => email.includes("@")),
    ),
  ];
  const nextSet = new Set(next);
  const preserved: GoogleCalendarAttendee[] = [];
  const seen = new Set<string>();
  for (const attendee of input.existing) {
    const email = parseBareEmailAddress(attendee.email ?? "");
    if (!email.includes("@") || seen.has(email)) continue;
    // Drop guests we previously pushed from Backster and that are no longer selected.
    if (previous.has(email) && !nextSet.has(email)) continue;
    if (nextSet.has(email)) {
      // Will re-add from the Backster list below so order stays contact-stable.
      continue;
    }
    seen.add(email);
    preserved.push({ ...attendee, email });
  }
  const managed: GoogleCalendarAttendee[] = next.map((email) => {
    const prior = input.existing.find(
      (attendee) => parseBareEmailAddress(attendee.email ?? "") === email,
    );
    return prior ? { ...prior, email } : { email };
  });
  return [...managed, ...preserved];
}

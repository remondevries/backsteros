import { parseYmdLocal } from "@backsteros/contracts";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** `28 Aug 1990` — always includes the year. */
export function formatBirthdayLabel(
  birthday: string | null | undefined,
): string | null {
  const ymd = birthday?.trim().slice(0, 10) ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const date = parseYmdLocal(ymd);
  if (!date) return null;
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

/** Whole years since birth date (local calendar). */
export function ageYearsFromBirthday(
  birthday: string | null | undefined,
  now: Date = new Date(),
): number | null {
  const ymd = birthday?.trim().slice(0, 10) ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const birth = parseYmdLocal(ymd);
  if (!birth) return null;
  let age = now.getFullYear() - birth.getFullYear();
  const monthDelta = now.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age < 0 ? null : age;
}

export function formatBirthdayAgeLabel(
  birthday: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const age = ageYearsFromBirthday(birthday, now);
  if (age == null) return null;
  return age === 1 ? "1 year" : `${age} years`;
}

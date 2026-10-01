import { readPgError } from "./soft-unique-conflicts.js";

/** Stop retrying after this many apply attempts (initial failure counts as 1). */
export const DEAD_LETTER_MAX_ATTEMPTS = 12;
const BASE_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 3_600_000;

export function deadLetterBackoffMs(attempts: number): number {
  const exp = Math.max(0, attempts - 1);
  const ms = BASE_BACKOFF_MS * 2 ** exp;
  return Math.min(MAX_BACKOFF_MS, ms);
}

export function deadLetterMaxBackoffMs(): number {
  return MAX_BACKOFF_MS;
}

export function errorCodeFromUnknown(error: unknown): string {
  const pg = readPgError(error);
  if (pg?.code) return pg.code;
  if (error instanceof Error && error.name) return error.name;
  return "apply_error";
}

export function errorMessageFromUnknown(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

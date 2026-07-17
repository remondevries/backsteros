import { migrateLegacyTaskStatus, type TaskStatus } from "@/lib/task-status";

export type LetterDragPayload = {
  letterId: string;
  status: TaskStatus;
};

export type LetterReorderRequest = {
  letterId: string;
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
  beforeLetterId: string | null;
};

const LETTER_ORDER_KEY_PREFIX = "letter:";
const GROUP_APPEND_KEY_PREFIX = "group-append:";

export function letterOrderKey(letterId: string): string {
  return `${LETTER_ORDER_KEY_PREFIX}${letterId}`;
}

export function letterGroupAppendOrderKey(status: TaskStatus): string {
  return `${GROUP_APPEND_KEY_PREFIX}${status}`;
}

export function parseLetterDragPayload(raw: string): LetterDragPayload | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    if (
      typeof record.letterId !== "string" ||
      typeof record.status !== "string"
    ) {
      return null;
    }

    return {
      letterId: record.letterId,
      status: migrateLegacyTaskStatus(record.status),
    };
  } catch {
    return null;
  }
}

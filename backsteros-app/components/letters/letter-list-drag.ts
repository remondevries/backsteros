import type { Letter } from "@/lib/db/schema";
import { migrateLegacyTaskStatus } from "@/lib/task-status";
import {
  letterGroupAppendOrderKey,
  letterOrderKey,
  parseLetterDragPayload,
  type LetterDragPayload,
  type LetterReorderRequest,
} from "@/lib/letters/letter-list-drag-shared";

export type { LetterDragPayload, LetterReorderRequest };

export const LETTER_LIST_DRAG_TYPE = "application/x-circle-letter-item";

export function createLetterDragPayload(letter: Letter): string {
  const payload: LetterDragPayload = {
    letterId: letter.id,
    status: migrateLegacyTaskStatus(letter.status),
  };

  return JSON.stringify(payload);
}

export function readLetterDragPayload(
  dataTransfer: DataTransfer,
): LetterDragPayload | null {
  return parseLetterDragPayload(dataTransfer.getData(LETTER_LIST_DRAG_TYPE));
}

export function isLetterListDragActive(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes(LETTER_LIST_DRAG_TYPE);
}

export function resolveLetterDropBeforeLetter(input: {
  payload: LetterDragPayload;
  targetLetter: Letter;
}): LetterReorderRequest | null {
  const { payload, targetLetter } = input;

  if (payload.letterId === targetLetter.id) {
    return null;
  }

  const toStatus = migrateLegacyTaskStatus(targetLetter.status);

  return {
    letterId: payload.letterId,
    fromStatus: payload.status,
    toStatus,
    beforeLetterId: targetLetter.id,
  };
}

export function resolveLetterDropOnGroupAppend(input: {
  payload: LetterDragPayload;
  status: Letter["status"];
}): LetterReorderRequest {
  const toStatus = migrateLegacyTaskStatus(input.status);

  return {
    letterId: input.payload.letterId,
    fromStatus: input.payload.status,
    toStatus,
    beforeLetterId: null,
  };
}

export { letterGroupAppendOrderKey, letterOrderKey };

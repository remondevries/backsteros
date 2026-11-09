/**
 * Provider-agnostic room command / attribute contract shared by Director and
 * the client-portal guest. Media backends only need a reliable data channel
 * + participant attributes that can carry these string keys / JSON payloads.
 */

export const MEETING_ROOM_ATTR = {
  phase: "bm.phase",
  camera: "bm.camera",
  roomOpen: "bm.roomOpen",
  theme: "bm.theme",
  presentation: "bm.presentation",
  presentationKind: "bm.presentationKind",
  presentationMode: "bm.presentationMode",
  presentationUrl: "bm.presentationUrl",
  presentationViewport: "bm.presentationViewport",
} as const;

export type MeetingRoomAttrKey =
  (typeof MEETING_ROOM_ATTR)[keyof typeof MEETING_ROOM_ATTR];

export type MeetingRoomGuestPhase = "lobby" | "ready" | "room";

/** Wire format already spoken by Director + portal guests — keep stable. */
export type MeetingRoomDataMessage =
  | { type: "bm.camera"; on: boolean }
  | { type: "bm.phase"; phase: MeetingRoomGuestPhase }
  | { type: "bm.audioSignal"; level: number }
  | {
      type: "bm.presentation";
      on: boolean;
      kind?: string | null;
      mode?: string | null;
      url?: string | null;
      viewport?: string | null;
    }
  | { type: "bm.roomOpen"; open: boolean }
  | { type: "bm.theme"; theme: "dark" | "light" };

export function encodeMeetingRoomDataMessage(
  message: MeetingRoomDataMessage,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(message));
}

export function decodeMeetingRoomDataMessage(
  payload: Uint8Array,
): MeetingRoomDataMessage | null {
  try {
    const message = JSON.parse(new TextDecoder().decode(payload)) as {
      type?: string;
    };
    if (!message || typeof message.type !== "string") return null;
    if (
      message.type === "bm.camera" ||
      message.type === "bm.phase" ||
      message.type === "bm.audioSignal" ||
      message.type === "bm.presentation" ||
      message.type === "bm.roomOpen" ||
      message.type === "bm.theme"
    ) {
      return message as MeetingRoomDataMessage;
    }
    return null;
  } catch {
    return null;
  }
}

/** Guest identities always use this prefix (portal: guest-<contactId>). */
export const MEETING_ROOM_GUEST_IDENTITY_PREFIX = "guest-";
/** Host Director identities always use this prefix (core: host-<ownerKey>). */
export const MEETING_ROOM_HOST_IDENTITY_PREFIX = "host-";

export function isMeetingRoomGuestIdentity(identity: string): boolean {
  return identity.startsWith(MEETING_ROOM_GUEST_IDENTITY_PREFIX);
}

export function isMeetingRoomHostIdentity(identity: string): boolean {
  return identity.startsWith(MEETING_ROOM_HOST_IDENTITY_PREFIX);
}

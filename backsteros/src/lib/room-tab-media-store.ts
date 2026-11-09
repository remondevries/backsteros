/**
 * Per-meeting local media indicators for room product-tab icons.
 *
 * Discrete cam/mic changes notify React subscribers. Audio levels notify
 * per-meeting listeners so tab icons can update CSS vars without re-rendering
 * the shell every analyser frame.
 */

export type RoomTabMediaIndicator = {
  /** Local participant has a published camera track. */
  cameraPublished: boolean;
  /** Local microphone is enabled (not muted). */
  micEnabled: boolean;
  /** Raw analyser / LiveKit level 0–1; 0 when muted or disconnected. */
  audioLevel: number;
};

export type RoomTabMediaDiscrete = {
  cameraPublished: boolean;
  micEnabled: boolean;
};

const IDLE: RoomTabMediaDiscrete = {
  cameraPublished: false,
  micEnabled: false,
};

const discreteByMeeting = new Map<string, RoomTabMediaDiscrete>();
const audioByMeeting = new Map<string, number>();
const discreteListeners = new Set<() => void>();
const audioListenersByMeeting = new Map<string, Set<(level: number) => void>>();

let discreteEpoch = 0;

function discreteEqual(
  left: RoomTabMediaDiscrete,
  right: RoomTabMediaDiscrete,
): boolean {
  return (
    left.cameraPublished === right.cameraPublished &&
    left.micEnabled === right.micEnabled
  );
}

function emitDiscrete(): void {
  discreteEpoch += 1;
  for (const listener of discreteListeners) listener();
}

function emitAudio(meetingId: string, level: number): void {
  const listeners = audioListenersByMeeting.get(meetingId);
  if (!listeners) return;
  for (const listener of listeners) listener(level);
}

export function setRoomTabMedia(
  meetingId: string,
  next: RoomTabMediaIndicator | null,
): void {
  const id = meetingId.trim();
  if (!id) return;

  if (!next) {
    const hadDiscrete = discreteByMeeting.delete(id);
    const hadAudio = audioByMeeting.delete(id);
    if (hadAudio) emitAudio(id, 0);
    if (hadDiscrete) emitDiscrete();
    return;
  }

  const discrete: RoomTabMediaDiscrete = {
    cameraPublished: Boolean(next.cameraPublished),
    micEnabled: Boolean(next.micEnabled),
  };
  const previous = discreteByMeeting.get(id) ?? IDLE;
  if (!discreteEqual(previous, discrete)) {
    discreteByMeeting.set(id, discrete);
    emitDiscrete();
  } else if (!discreteByMeeting.has(id)) {
    discreteByMeeting.set(id, discrete);
  }

  const level =
    discrete.micEnabled && Number.isFinite(next.audioLevel)
      ? Math.max(0, next.audioLevel)
      : 0;
  const previousLevel = audioByMeeting.get(id) ?? 0;
  if (previousLevel !== level) {
    audioByMeeting.set(id, level);
    emitAudio(id, level);
  } else if (!audioByMeeting.has(id)) {
    audioByMeeting.set(id, level);
  }
}

export function clearRoomTabMedia(meetingId: string): void {
  setRoomTabMedia(meetingId, null);
}

export function getRoomTabMediaDiscrete(
  meetingId: string | null | undefined,
): RoomTabMediaDiscrete {
  if (!meetingId?.trim()) return IDLE;
  return discreteByMeeting.get(meetingId.trim()) ?? IDLE;
}

export function getRoomTabMediaAudioLevel(
  meetingId: string | null | undefined,
): number {
  if (!meetingId?.trim()) return 0;
  return audioByMeeting.get(meetingId.trim()) ?? 0;
}

export function subscribeRoomTabMediaDiscrete(listener: () => void): () => void {
  discreteListeners.add(listener);
  return () => {
    discreteListeners.delete(listener);
  };
}

/** Snapshot token so useSyncExternalStore notices discrete flips. */
export function getRoomTabMediaDiscreteEpoch(): number {
  return discreteEpoch;
}

export function subscribeRoomTabMediaAudio(
  meetingId: string,
  listener: (level: number) => void,
): () => void {
  const id = meetingId.trim();
  if (!id) return () => undefined;
  let set = audioListenersByMeeting.get(id);
  if (!set) {
    set = new Set();
    audioListenersByMeeting.set(id, set);
  }
  set.add(listener);
  listener(audioByMeeting.get(id) ?? 0);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) audioListenersByMeeting.delete(id);
  };
}

export function formatRoomTabMediaTooltip(discrete: RoomTabMediaDiscrete): string {
  const cam = discrete.cameraPublished ? "Camera on" : "Camera off";
  const mic = discrete.micEnabled ? "microphone on" : "microphone muted";
  return `${cam}, ${mic}`;
}

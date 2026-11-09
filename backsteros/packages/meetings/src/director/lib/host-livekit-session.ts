import { ConnectionState, Room, RoomEvent } from "livekit-client";

import {
  activeMeetingRoomProvider,
  type FetchMeetingRoomTokenOptions,
  type MeetingRoomCredentials,
} from "../../room/index";

/** Serializes all host LiveKit connect/teardown work (avoids overlapping rooms). */
let queue: Promise<unknown> = Promise.resolve();

export function enqueueHostLiveKitTask<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function disconnectHostRoom(room: Room | null): Promise<void> {
  if (!room) return;
  try {
    room.removeAllListeners();
  } catch {
    /* ignore */
  }
  await Promise.race([
    (async () => {
      // Only mute — never stop() tracks yourself (WebKit.GPU aborts on macOS).
      try {
        if (room.state === ConnectionState.Connected) {
          await room.localParticipant.setCameraEnabled(false);
          await room.localParticipant.setMicrophoneEnabled(false);
        }
      } catch {
        /* ignore */
      }
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 200);
      });
      try {
        await room.disconnect();
      } catch {
        /* ignore */
      }
    })(),
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, 3_000);
    }),
  ]);
}

export type ConnectHostRoomOptions = {
  meetingId: string;
  attachListeners: (room: Room) => void;
  /** Authenticated core request (required — tokens are never minted in the client). */
  requestJson: FetchMeetingRoomTokenOptions["requestJson"];
  displayName?: string;
  /** Optional override for tests / alternate media backends. */
  fetchCredentials?: (
    options: FetchMeetingRoomTokenOptions,
  ) => Promise<MeetingRoomCredentials>;
};

export async function connectHostRoom(
  options: ConnectHostRoomOptions,
): Promise<{ room: Room; roomName: string; credentials: MeetingRoomCredentials }> {
  const fetchCredentials =
    options.fetchCredentials ??
    ((opts: FetchMeetingRoomTokenOptions) =>
      activeMeetingRoomProvider.fetchCredentials(opts));
  const credentials = await fetchCredentials({
    meetingId: options.meetingId,
    role: "host",
    displayName: options.displayName,
    requestJson: options.requestJson,
  });
  if (credentials.provider !== "livekit") {
    throw new Error(
      `Unsupported meeting room provider: ${credentials.provider}`,
    );
  }

  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
  });
  options.attachListeners(room);

  const connectTimeoutMs = 12_000;
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    void room.disconnect().catch(() => undefined);
  }, connectTimeoutMs);
  try {
    await room.connect(credentials.url, credentials.token);
  } finally {
    window.clearTimeout(timeoutId);
  }
  if (timedOut) {
    throw new Error(
      `LiveKit connect timed out after ${connectTimeoutMs / 1000}s`,
    );
  }
  if (room.state !== ConnectionState.Connected) {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        cleanup();
        reject(
          new Error(`LiveKit engine not connected (state=${room.state})`),
        );
      }, 8_000);
      const onConnected = () => {
        cleanup();
        resolve();
      };
      const onDisconnected = () => {
        cleanup();
        reject(new Error("LiveKit disconnected before ready"));
      };
      const cleanup = () => {
        window.clearTimeout(timer);
        room.off(RoomEvent.Connected, onConnected);
        room.off(RoomEvent.Disconnected, onDisconnected);
      };
      room.on(RoomEvent.Connected, onConnected);
      room.on(RoomEvent.Disconnected, onDisconnected);
    });
  }

  return {
    room,
    roomName: credentials.room,
    credentials,
  };
}

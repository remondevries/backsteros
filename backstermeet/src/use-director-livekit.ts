import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type LocalParticipant,
  type LocalTrackPublication,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type TrackPublication,
} from "livekit-client";
import { usePresentationViewportStream } from "./hooks/use-presentation-viewport-stream";
import {
  connectHostRoom,
  disconnectHostRoom,
  enqueueHostLiveKitTask,
} from "./lib/host-livekit-session";
import {
  getPresentationDeliveryMode,
  PRESENTATION_ATTR,
  type PresentationKind,
} from "./presentation";

const AUDIO_SIGNAL_GATE = 0.008;
const AUDIO_SIGNAL_INTERVAL_MS = 45;
const AUDIO_SIGNAL_TTL_MS = 140;

export type GuestPhase = "lobby" | "ready" | "room";

export type GuestFeed = {
  identity: string;
  name: string;
  phase: GuestPhase;
  hasCamera: boolean;
};

function isGuest(participant: RemoteParticipant): boolean {
  return participant.identity.startsWith("guest-");
}

/** Avoid LiveKit re-attach — it resets the decoder and flickers the <video>. */
function attachCameraTrackIfNeeded(
  track: { attach: (el: HTMLMediaElement) => HTMLMediaElement; attachedElements?: HTMLMediaElement[] },
  el: HTMLVideoElement,
): void {
  const attached = track.attachedElements ?? [];
  if (attached.includes(el)) return;
  track.attach(el);
}

function guestPhase(participant: RemoteParticipant): GuestPhase {
  const phase = participant.attributes?.["bm.phase"];
  if (phase === "ready") return "ready";
  if (phase === "lobby") return "lobby";
  return "room";
}

export function visitorNotice(
  count: number,
  kind: "waiting" | "ready",
): string {
  const noun = count === 1 ? "visitor" : "visitors";
  return `${count} ${noun} ${kind}`;
}

function isEngineNotConnectedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /engine not connected/i.test(message);
}

async function waitForRoomConnected(
  room: Room,
  timeoutMs = 12_000,
): Promise<void> {
  if (room.state === ConnectionState.Connected) return;
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `LiveKit engine not connected (state=${room.state}) within timeout`,
        ),
      );
    }, timeoutMs);
    const onConnected = () => {
      cleanup();
      resolve();
    };
    const onDisconnected = () => {
      cleanup();
      reject(new Error("LiveKit disconnected before engine was ready"));
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

export function useDirectorLiveKit({
  cameraOn,
  cameraIntent,
  muted,
  selectedDeviceId,
  selectedAudioDeviceId,
  localVideoRef,
  activePresentation,
  presentationUrl,
  meetingId,
  stageTheme,
  roomOpen,
  viewportCaptureEnabled,
}: {
  /** Whether the local camera track should be published. */
  cameraOn: boolean;
  /**
   * Guest-facing camera desire. Publish immediately on toggle so guests can
   * start the exit slide while `cameraOn` stays true through the animation.
   */
  cameraIntent: boolean;
  muted: boolean;
  selectedDeviceId: string;
  selectedAudioDeviceId: string;
  localVideoRef: RefObject<HTMLVideoElement | null>;
  /** Guest-visible presentation; null means room stays on host-fullscreen. */
  activePresentation: PresentationKind | null;
  /** Synced iframe URL (local mode) while broadcasting. */
  presentationUrl: string | null;
  /** LiveKit room name — matches portal guest route when set. */
  meetingId: string | null;
  /** Portal stage surround synced to guests. */
  stageTheme: "dark" | "light";
  /** When true, waiting guests may enter the meeting. */
  roomOpen: boolean;
  /**
   * Keep screen-capture allowed while Screenshare is selected (even before
   * Broadcast). Leaving Screenshare tears the capture down.
   */
  viewportCaptureEnabled: boolean;
}) {
  const roomRef = useRef<Room | null>(null);
  /** Bumped on each meetingId effect so stale connects abort cleanly. */
  const connectionGenRef = useRef(0);
  const guestVideoEls = useRef(new Map<string, HTMLVideoElement>());
  const enteringGuestVideoEls = useRef(new Map<string, HTMLVideoElement>());
  /** Identities whose overlay <video> used LiveKit attach (rare fallback). */
  const enteringLiveKitAttached = useRef(new Set<string>());
  const localAudioMeterActiveRef = useRef(false);
  const remoteAudioSignalsRef = useRef(
    new Map<string, { level: number; expiresAt: number }>(),
  );
  const [roomName, setRoomName] = useState("backstermeet-dev");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [guestCount, setGuestCount] = useState(0);
  const [waitingCount, setWaitingCount] = useState(0);
  const [readyCount, setReadyCount] = useState(0);
  const [inRoomCount, setInRoomCount] = useState(0);
  const [guestFeeds, setGuestFeeds] = useState<GuestFeed[]>([]);
  const [localCameraReady, setLocalCameraReady] = useState(false);
  const [hostAudioLevel, setHostAudioLevel] = useState(0);
  const [guestAudioLevels, setGuestAudioLevels] = useState<
    Record<string, number>
  >({});

  const viewportEnabled = viewportCaptureEnabled;

  const {
    phase: viewportStreamPhase,
    error: viewportStreamError,
    previewStream: viewportPreviewStream,
    start: startViewportStream,
    stop: stopViewportStream,
  } = usePresentationViewportStream({
    roomRef,
    connected,
    enabled: viewportEnabled,
  });

  function syncGuestFeeds(room: Room) {
    const feeds: GuestFeed[] = [];
    let lobbyN = 0;
    let readyN = 0;
    let inRoomN = 0;

    for (const participant of room.remoteParticipants.values()) {
      if (!isGuest(participant)) continue;
      const phase = guestPhase(participant);
      if (phase === "lobby") lobbyN += 1;
      else if (phase === "ready") readyN += 1;
      else inRoomN += 1;

      let hasCamera = false;
      for (const publication of participant.trackPublications.values()) {
        if (
          publication.kind === Track.Kind.Video &&
          publication.source === Track.Source.Camera &&
          publication.track &&
          !publication.isMuted
        ) {
          hasCamera = true;
          const pipEl = guestVideoEls.current.get(participant.identity);
          const enteringEl = enteringGuestVideoEls.current.get(
            participant.identity,
          );
          if (pipEl) attachCameraTrackIfNeeded(publication.track, pipEl);
          // Overlay mirrors the pip stream — do not LiveKit-attach it.
          if (enteringEl && pipEl?.srcObject) {
            if (enteringEl.srcObject !== pipEl.srcObject) {
              enteringEl.srcObject = pipEl.srcObject;
            }
            void enteringEl.play().catch(() => undefined);
          }
        }
      }

      const feed: GuestFeed = {
        identity: participant.identity,
        name: participant.name || participant.identity,
        phase,
        hasCamera,
      };

      if (phase === "room") feeds.push(feed);
    }

    setGuestFeeds((previous) => {
      if (
        previous.length === feeds.length &&
        previous.every(
          (feed, index) =>
            feed.identity === feeds[index]?.identity &&
            feed.name === feeds[index]?.name &&
            feed.phase === feeds[index]?.phase &&
            feed.hasCamera === feeds[index]?.hasCamera,
        )
      ) {
        return previous;
      }
      return feeds;
    });
    setWaitingCount(lobbyN);
    setReadyCount(readyN);
    setInRoomCount(inRoomN);
    setGuestCount(lobbyN + readyN + inRoomN);
  }

  const bindGuestVideoEl = useCallback(
    (identity: string, el: HTMLVideoElement | null) => {
      if (!el) {
        guestVideoEls.current.delete(identity);
        return;
      }
      if (guestVideoEls.current.get(identity) === el) {
        return;
      }
      guestVideoEls.current.set(identity, el);
      const room = roomRef.current;
      if (!room) return;
      const participant = room.remoteParticipants.get(identity);
      if (!participant) return;
      for (const publication of participant.trackPublications.values()) {
        if (
          publication.kind === Track.Kind.Video &&
          publication.source === Track.Source.Camera &&
          publication.track
        ) {
          attachCameraTrackIfNeeded(publication.track, el);
          void el.play().catch(() => undefined);
          // Keep any exit/enter overlay in sync via srcObject (no second attach).
          const enteringEl = enteringGuestVideoEls.current.get(identity);
          if (enteringEl && el.srcObject) {
            if (enteringEl.srcObject !== el.srcObject) {
              enteringEl.srcObject = el.srcObject;
            }
            void enteringEl.play().catch(() => undefined);
          }
        }
      }
    },
    [],
  );

  const bindEnteringGuestVideoEl = useCallback(
    (identity: string, el: HTMLVideoElement | null) => {
      if (!el) {
        const previous = enteringGuestVideoEls.current.get(identity);
        enteringGuestVideoEls.current.delete(identity);
        const usedLiveKit = enteringLiveKitAttached.current.delete(identity);
        if (previous && usedLiveKit) {
          const participant = roomRef.current?.remoteParticipants.get(identity);
          for (const publication of participant?.trackPublications.values() ??
            []) {
            if (
              publication.kind === Track.Kind.Video &&
              publication.source === Track.Source.Camera &&
              publication.track
            ) {
              publication.track.detach(previous);
            }
          }
        } else if (previous) {
          previous.srcObject = null;
        }
        return;
      }
      if (enteringGuestVideoEls.current.get(identity) === el) {
        return;
      }
      enteringGuestVideoEls.current.set(identity, el);

      const pipEl = guestVideoEls.current.get(identity);
      const mirrored = pipEl?.srcObject;
      if (mirrored) {
        enteringLiveKitAttached.current.delete(identity);
        if (el.srcObject !== mirrored) el.srcObject = mirrored;
        void el.play().catch(() => undefined);
        return;
      }

      // Pip not mounted yet — last-resort LiveKit attach (detached on unmount).
      const participant = roomRef.current?.remoteParticipants.get(identity);
      if (!participant) return;
      for (const publication of participant.trackPublications.values()) {
        if (
          publication.kind === Track.Kind.Video &&
          publication.source === Track.Source.Camera &&
          publication.track
        ) {
          attachCameraTrackIfNeeded(publication.track, el);
          enteringLiveKitAttached.current.add(identity);
          void el.play().catch(() => undefined);
        }
      }
    },
    [],
  );

  /** Ensure pip videos are playing a live frame before the exit overlay drops. */
  const warmGuestPipVideos = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    for (const [identity, el] of guestVideoEls.current) {
      const participant = room.remoteParticipants.get(identity);
      if (!participant) continue;
      for (const publication of participant.trackPublications.values()) {
        if (
          publication.kind === Track.Kind.Video &&
          publication.source === Track.Source.Camera &&
          publication.track
        ) {
          attachCameraTrackIfNeeded(publication.track, el);
          void el.play().catch(() => undefined);
        }
      }
    }
  }, []);

  useEffect(() => {
    const gen = ++connectionGenRef.current;
    let audioPoll: number | undefined;
    const targetMeetingId = meetingId?.trim() || null;

    setConnected(false);
    setConnectionError(null);
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    guestVideoEls.current.clear();
    enteringGuestVideoEls.current.clear();
    enteringLiveKitAttached.current.clear();
    remoteAudioSignalsRef.current.clear();
    setGuestFeeds([]);
    setGuestCount(0);
    setWaitingCount(0);
    setReadyCount(0);
    setInRoomCount(0);
    setHostAudioLevel(0);
    setGuestAudioLevels({});

    void enqueueHostLiveKitTask(async () => {
      const previous = roomRef.current;
      roomRef.current = null;
      await disconnectHostRoom(previous);
      if (gen !== connectionGenRef.current) return;

      if (!targetMeetingId) {
        setRoomName("backstermeet-dev");
        return;
      }

      try {
        console.log("[Director] LiveKit connecting", {
          meetingId: targetMeetingId,
        });
        const { room, roomName: nextRoomName } = await connectHostRoom(
          targetMeetingId,
          (next) => {
            function onTrackSubscribed(
              track: RemoteTrack,
              publication: RemoteTrackPublication,
              participant: RemoteParticipant,
            ) {
              if (!isGuest(participant)) return;
              if (
                track.kind === Track.Kind.Video &&
                publication.source === Track.Source.Camera
              ) {
                const pipEl = guestVideoEls.current.get(participant.identity);
                const enteringEl = enteringGuestVideoEls.current.get(
                  participant.identity,
                );
                if (pipEl) attachCameraTrackIfNeeded(track, pipEl);
                if (enteringEl && pipEl?.srcObject) {
                  if (enteringEl.srcObject !== pipEl.srcObject) {
                    enteringEl.srcObject = pipEl.srcObject;
                  }
                  void enteringEl.play().catch(() => undefined);
                }
              }
              if (track.kind === Track.Kind.Audio) {
                track.attach();
              }
              syncGuestFeeds(next);
            }

            function onTrackUnsubscribed(
              track: RemoteTrack,
              _publication: RemoteTrackPublication,
              participant: RemoteParticipant,
            ) {
              track.detach();
              if (isGuest(participant)) syncGuestFeeds(next);
            }

            function onTrackMuted(
              publication: TrackPublication,
              participant: Participant,
            ) {
              if (!participant.identity.startsWith("guest-")) return;
              if (
                publication.kind === Track.Kind.Video &&
                publication.source === Track.Source.Camera
              ) {
                syncGuestFeeds(next);
              }
            }

            function onTrackUnmuted(
              publication: TrackPublication,
              participant: Participant,
            ) {
              if (!participant.identity.startsWith("guest-")) return;
              if (
                publication.kind === Track.Kind.Video &&
                publication.source === Track.Source.Camera
              ) {
                const el = guestVideoEls.current.get(participant.identity);
                if (el && publication.track) {
                  attachCameraTrackIfNeeded(publication.track, el);
                }
                syncGuestFeeds(next);
              }
            }

            function onParticipantChange() {
              syncGuestFeeds(next);
            }

            function onGuestAttributesChanged(
              _changed: Record<string, string>,
              participant: RemoteParticipant | LocalParticipant,
            ) {
              if (!participant.identity.startsWith("guest-")) return;
              syncGuestFeeds(next);
            }

            function onGuestData(
              payload: Uint8Array,
              participant?: RemoteParticipant,
            ) {
              if (participant && !isGuest(participant)) return;
              try {
                const message = JSON.parse(
                  new TextDecoder().decode(payload),
                ) as {
                  type?: string;
                  level?: unknown;
                };
                if (message?.type === "bm.phase") {
                  syncGuestFeeds(next);
                }
                if (
                  message?.type === "bm.audioSignal" &&
                  participant &&
                  typeof message.level === "number"
                ) {
                  remoteAudioSignalsRef.current.set(participant.identity, {
                    level: Math.max(0, Math.min(1, message.level)),
                    expiresAt: performance.now() + AUDIO_SIGNAL_TTL_MS,
                  });
                }
              } catch {
                /* ignore */
              }
            }

            next.on(RoomEvent.ParticipantConnected, onParticipantChange);
            next.on(RoomEvent.ParticipantDisconnected, onParticipantChange);
            next.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
            next.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
            next.on(RoomEvent.TrackMuted, onTrackMuted);
            next.on(RoomEvent.TrackUnmuted, onTrackUnmuted);
            next.on(
              RoomEvent.ParticipantAttributesChanged,
              onGuestAttributesChanged,
            );
            next.on(RoomEvent.DataReceived, onGuestData);
          },
        );

        if (gen !== connectionGenRef.current) {
          await disconnectHostRoom(room);
          return;
        }

        roomRef.current = room;
        setRoomName(nextRoomName);
        syncGuestFeeds(room);
        setConnected(true);
        setConnectionError(null);
        console.log("[Director] LiveKit connected", nextRoomName);

        audioPoll = window.setInterval(() => {
          if (gen !== connectionGenRef.current) return;
          const current = roomRef.current;
          if (!current) return;
          if (!localAudioMeterActiveRef.current) {
            setHostAudioLevel(current.localParticipant.audioLevel || 0);
          }
          const levels: Record<string, number> = {};
          for (const participant of current.remoteParticipants.values()) {
            if (!isGuest(participant)) continue;
            const signal = remoteAudioSignalsRef.current.get(
              participant.identity,
            );
            if (signal && signal.expiresAt <= performance.now()) {
              remoteAudioSignalsRef.current.delete(participant.identity);
            }
            levels[participant.identity] = Math.max(
              participant.audioLevel || 0,
              signal && signal.expiresAt > performance.now()
                ? signal.level
                : 0,
            );
          }
          // Quantize so VU CSS vars update without a state write every poll.
          const quantized: Record<string, number> = {};
          for (const [id, level] of Object.entries(levels)) {
            quantized[id] = Math.round(level * 40) / 40;
          }
          setGuestAudioLevels((previous) => {
            const prevKeys = Object.keys(previous);
            const nextKeys = Object.keys(quantized);
            if (prevKeys.length !== nextKeys.length) return quantized;
            for (const key of nextKeys) {
              if (previous[key] !== quantized[key]) return quantized;
            }
            return previous;
          });
        }, 40);
      } catch (err) {
        if (gen !== connectionGenRef.current) return;
        const message =
          err instanceof Error ? err.message : "LiveKit connection failed";
        setConnectionError(message);
        setConnected(false);
        console.log("[Director] LiveKit error:", message);
      }
    });

    return () => {
      if (audioPoll != null) window.clearInterval(audioPoll);
      // Unmount (no successor effect): invalidate + disconnect.
      // Successor effects bump connectionGenRef themselves at start.
      if (connectionGenRef.current === gen) {
        connectionGenRef.current += 1;
        void enqueueHostLiveKitTask(async () => {
          const room = roomRef.current;
          roomRef.current = null;
          await disconnectHostRoom(room);
        });
      }
    };
  }, [meetingId, localVideoRef]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || !connected) return;
    let cancelled = false;

    async function publishCameraIntent() {
      try {
        const payload = new TextEncoder().encode(
          JSON.stringify({ type: "bm.camera", on: cameraIntent }),
        );
        await room!.localParticipant.publishData(payload, { reliable: true });
      } catch (dataErr) {
        if (cancelled) return;
        console.log(
          "[Director] camera data skipped:",
          dataErr instanceof Error ? dataErr.message : dataErr,
        );
      }
      try {
        await room!.localParticipant.setAttributes({
          "bm.camera": cameraIntent ? "1" : "0",
        });
      } catch (attrErr) {
        if (cancelled) return;
        console.log(
          "[Director] camera attribute skipped:",
          attrErr instanceof Error ? attrErr.message : attrErr,
        );
      }
    }

    void publishCameraIntent();
    return () => {
      cancelled = true;
    };
  }, [cameraIntent, connected]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || !connected) return;
    let cancelled = false;
    let videoElement: HTMLVideoElement | null = null;
    const markCameraReady = () => {
      if (!cancelled) setLocalCameraReady(true);
    };
    const roomStillCurrent = () =>
      !cancelled && roomRef.current === room && room.state === ConnectionState.Connected;

    async function syncCamera() {
      try {
        if (!cameraOn) {
          setLocalCameraReady(false);
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = null;
          }
          if (!roomStillCurrent()) return;
          await room!.localParticipant.setCameraEnabled(false);
          return;
        }

        setLocalCameraReady(false);

        if (room!.state !== ConnectionState.Connected) {
          await waitForRoomConnected(room!);
          if (!roomStillCurrent()) return;
        }

        const enableCamera = async () => {
          if (!roomStillCurrent()) return;
          const existingCamera = [
            ...room!.localParticipant.videoTrackPublications.values(),
          ].find(
            (entry: LocalTrackPublication) =>
              entry.source === Track.Source.Camera && entry.track,
          );

          if (
            existingCamera?.track &&
            !existingCamera.isMuted &&
            selectedDeviceId
          ) {
            // Camera already published — swap the capture device in place.
            await room!.switchActiveDevice("videoinput", selectedDeviceId);
          } else {
            // A disabled camera leaves a muted publication behind. It must be
            // explicitly enabled again rather than treated as a device swap.
            await room!.localParticipant.setCameraEnabled(true, {
              deviceId: selectedDeviceId
                ? { exact: selectedDeviceId }
                : undefined,
            });
          }
        };

        try {
          await enableCamera();
        } catch (err) {
          // React Strict Mode / reconnect races can close the PC mid-publish.
          if (!isEngineNotConnectedError(err) || cancelled) throw err;
          console.log("[Director] camera publish retry after engine stall");
          await waitForRoomConnected(room!);
          if (!roomStillCurrent()) return;
          await enableCamera();
        }

        if (!roomStillCurrent()) return;

        const publication = [
          ...room!.localParticipant.videoTrackPublications.values(),
        ].find(
          (entry: LocalTrackPublication) =>
            entry.source === Track.Source.Camera && entry.track,
        );
        if (publication?.track && localVideoRef.current) {
          videoElement = localVideoRef.current;
          videoElement.addEventListener("loadeddata", markCameraReady, {
            once: true,
          });
          videoElement.addEventListener("playing", markCameraReady, {
            once: true,
          });
          publication.track.attach(videoElement);
          void videoElement.play().catch(() => undefined);
          if (videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            markCameraReady();
          }
        }
        if (!cancelled) setConnectionError(null);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Camera publish failed";
        setConnectionError(message);
        console.log("[Director] camera publish error:", message);
      }
    }

    void syncCamera();
    return () => {
      cancelled = true;
      videoElement?.removeEventListener("loadeddata", markCameraReady);
      videoElement?.removeEventListener("playing", markCameraReady);
    };
  }, [cameraOn, connected, localVideoRef, selectedDeviceId]);

  // Re-attach local camera after HMR / remount when the <video> stays mounted.
  useEffect(() => {
    const room = roomRef.current;
    const el = localVideoRef.current;
    if (!room || !connected || !cameraOn || !el) return;

    const attach = () => {
      const publication = [
        ...room.localParticipant.videoTrackPublications.values(),
      ].find(
        (entry: LocalTrackPublication) =>
          entry.source === Track.Source.Camera && entry.track,
      );
      if (!publication?.track) return;
      publication.track.attach(el);
      void el.play().catch(() => undefined);
    };

    attach();
    const onLocalTrack = (publication: LocalTrackPublication) => {
      if (publication.source === Track.Source.Camera && publication.track) {
        attach();
      }
    };
    room.on(RoomEvent.LocalTrackPublished, onLocalTrack);
    return () => {
      room.off(RoomEvent.LocalTrackPublished, onLocalTrack);
    };
  }, [cameraOn, connected, localVideoRef]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || !connected) return;
    let cancelled = false;

    async function syncMicrophone() {
      try {
        if (muted) {
          await room!.localParticipant.setMicrophoneEnabled(false);
          return;
        }

        const existingMic = [
          ...room!.localParticipant.audioTrackPublications.values(),
        ].find(
          (entry: LocalTrackPublication) =>
            entry.source === Track.Source.Microphone && entry.track,
        );

        if (existingMic?.track && !existingMic.isMuted && selectedAudioDeviceId) {
          await room!.switchActiveDevice("audioinput", selectedAudioDeviceId);
        } else {
          await room!.localParticipant.setMicrophoneEnabled(true, {
            deviceId: selectedAudioDeviceId
              ? { exact: selectedAudioDeviceId }
              : undefined,
          });
        }
      } catch (err) {
        if (cancelled) return;
        console.log("[Director] microphone sync failed:", err);
      }
    }

    void syncMicrophone();
    return () => {
      cancelled = true;
    };
  }, [connected, muted, selectedAudioDeviceId]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || !connected || muted) {
      localAudioMeterActiveRef.current = false;
      setHostAudioLevel(0);
      return;
    }

    let cancelled = false;
    let frame = 0;
    let context: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;

    const attachMeter = async () => {
      if (cancelled || context) return;
      const publication = [
        ...room.localParticipant.audioTrackPublications.values(),
      ].find(
        (entry: LocalTrackPublication) =>
          entry.source === Track.Source.Microphone && entry.track,
      );
      const mediaTrack = publication?.track?.mediaStreamTrack;
      if (!mediaTrack) return;

      context = new AudioContext({ latencyHint: "interactive" });
      const analyser = context.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0;
      source = context.createMediaStreamSource(new MediaStream([mediaTrack]));
      source.connect(analyser);
      await context.resume().catch(() => undefined);
      if (cancelled) return;

      const samples = new Float32Array(analyser.fftSize);
      const encoder = new TextEncoder();
      let signalActive = false;
      let lastSignalAt = 0;
      localAudioMeterActiveRef.current = true;
      const measure = () => {
        if (cancelled) return;
        analyser.getFloatTimeDomainData(samples);
        let energy = 0;
        for (const sample of samples) energy += sample * sample;
        const level = Math.sqrt(energy / samples.length);
        setHostAudioLevel(level);
        const now = performance.now();
        if (
          level > AUDIO_SIGNAL_GATE &&
          (!signalActive || now - lastSignalAt >= AUDIO_SIGNAL_INTERVAL_MS)
        ) {
          signalActive = true;
          lastSignalAt = now;
          void room.localParticipant
            .publishData(
              encoder.encode(
                JSON.stringify({ type: "bm.audioSignal", level }),
              ),
              { reliable: false },
            )
            .catch(() => undefined);
        } else if (level <= AUDIO_SIGNAL_GATE) {
          signalActive = false;
        }
        frame = window.requestAnimationFrame(measure);
      };
      measure();
    };

    const onLocalTrackPublished = () => void attachMeter();
    room.on(RoomEvent.LocalTrackPublished, onLocalTrackPublished);
    void attachMeter();

    return () => {
      cancelled = true;
      localAudioMeterActiveRef.current = false;
      room.off(RoomEvent.LocalTrackPublished, onLocalTrackPublished);
      window.cancelAnimationFrame(frame);
      source?.disconnect();
      if (context) void context.close();
    };
  }, [connected, muted, selectedAudioDeviceId]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || !connected) return;
    let cancelled = false;

    async function publishActivePresentation() {
      try {
        const on = activePresentation !== null;
        const mode = getPresentationDeliveryMode(activePresentation);
        const url =
          on && mode === "iframe" ? (presentationUrl ?? "") : "";
        const payload = new TextEncoder().encode(
          JSON.stringify({
            type: "bm.presentation",
            on,
            kind: activePresentation,
            mode,
            url: url || null,
            viewport: viewportStreamPhase,
          }),
        );
        await room!.localParticipant.publishData(payload, { reliable: true });
        try {
          await room!.localParticipant.setAttributes({
            [PRESENTATION_ATTR.active]: on ? "1" : "0",
            [PRESENTATION_ATTR.kind]: activePresentation ?? "",
            [PRESENTATION_ATTR.mode]: mode ?? "",
            [PRESENTATION_ATTR.url]: url,
            [PRESENTATION_ATTR.viewport]: viewportStreamPhase,
          });
        } catch (attrErr) {
          console.log(
            "[Director] presentation attributes skipped:",
            attrErr instanceof Error ? attrErr.message : attrErr,
          );
        }
        console.log("[Director] active presentation published:", {
          kind: activePresentation,
          mode,
          url: url || null,
          viewport: viewportStreamPhase,
        });
      } catch (err) {
        if (cancelled) return;
        console.log("[Director] presentation publish failed:", err);
      }
    }

    void publishActivePresentation();

    function onGuestJoined(participant: RemoteParticipant) {
      if (!participant.identity.startsWith("guest-")) return;
      void publishActivePresentation();
    }
    room.on(RoomEvent.ParticipantConnected, onGuestJoined);

    return () => {
      cancelled = true;
      room.off(RoomEvent.ParticipantConnected, onGuestJoined);
    };
  }, [
    activePresentation,
    connected,
    presentationUrl,
    viewportStreamPhase,
  ]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || !connected) return;
    let cancelled = false;

    async function publishStageTheme() {
      try {
        const payload = new TextEncoder().encode(
          JSON.stringify({
            type: "bm.theme",
            theme: stageTheme,
          }),
        );
        await room!.localParticipant.publishData(payload, { reliable: true });
        try {
          await room!.localParticipant.setAttributes({
            "bm.theme": stageTheme,
          });
        } catch (attrErr) {
          console.log(
            "[Director] theme attributes skipped:",
            attrErr instanceof Error ? attrErr.message : attrErr,
          );
        }
        console.log("[Director] stage theme published:", stageTheme);
      } catch (err) {
        if (cancelled) return;
        console.log("[Director] theme publish failed:", err);
      }
    }

    void publishStageTheme();

    function onGuestJoined(participant: RemoteParticipant) {
      if (!participant.identity.startsWith("guest-")) return;
      void publishStageTheme();
    }
    room.on(RoomEvent.ParticipantConnected, onGuestJoined);

    return () => {
      cancelled = true;
      room.off(RoomEvent.ParticipantConnected, onGuestJoined);
    };
  }, [stageTheme, connected]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || !connected) return;
    let cancelled = false;

    async function publishRoomOpen() {
      try {
        const payload = new TextEncoder().encode(
          JSON.stringify({
            type: "bm.roomOpen",
            open: roomOpen,
          }),
        );
        await room!.localParticipant.publishData(payload, { reliable: true });
        try {
          await room!.localParticipant.setAttributes({
            "bm.roomOpen": roomOpen ? "1" : "0",
          });
        } catch (attrErr) {
          console.log(
            "[Director] roomOpen attributes skipped:",
            attrErr instanceof Error ? attrErr.message : attrErr,
          );
        }
        console.log("[Director] room open published:", roomOpen);
      } catch (err) {
        if (cancelled) return;
        console.log("[Director] roomOpen publish failed:", err);
      }
    }

    void publishRoomOpen();

    function onGuestJoined(participant: RemoteParticipant) {
      if (!participant.identity.startsWith("guest-")) return;
      void publishRoomOpen();
    }
    room.on(RoomEvent.ParticipantConnected, onGuestJoined);

    return () => {
      cancelled = true;
      room.off(RoomEvent.ParticipantConnected, onGuestJoined);
    };
  }, [roomOpen, connected]);

  return {
    roomName,
    connectionError,
    connected,
    guestCount,
    waitingCount,
    readyCount,
    inRoomCount,
    guestFeeds,
    localCameraReady,
    hostAudioLevel,
    guestAudioLevels,
    bindGuestVideoEl,
    bindEnteringGuestVideoEl,
    warmGuestPipVideos,
    viewportStreamPhase,
    viewportStreamError,
    viewportPreviewStream,
    startViewportStream,
    stopViewportStream,
  };
}

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  Room,
  Track,
  type LocalTrackPublication,
} from "livekit-client";

import type { PresentationViewportPhase } from "../presentation";
import { PRESENTATION_VIEWPORT_TRACK_NAME } from "../presentation-tracks";

type ViewportStreamOptions = {
  roomRef: RefObject<Room | null>;
  connected: boolean;
  /** True while share-screen presentation mode is active. */
  enabled: boolean;
};

/**
 * Captures a window/tab/screen via getDisplayMedia and publishes it as a
 * LiveKit screen-share track (`presentation-viewport`). Exposes the same
 * MediaStream for a local host preview.
 */
export function usePresentationViewportStream({
  roomRef,
  connected,
  enabled,
}: ViewportStreamOptions) {
  const [phase, setPhase] = useState<PresentationViewportPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const publicationRef = useRef<LocalTrackPublication | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);

  const stop = useCallback(async () => {
    const room = roomRef.current;
    const publication = publicationRef.current;
    publicationRef.current = null;

    if (publication?.track) {
      try {
        await room?.localParticipant.unpublishTrack(publication.track);
      } catch {
        /* best-effort */
      }
    }

    if (videoTrackRef.current) {
      videoTrackRef.current.onended = null;
      videoTrackRef.current.stop();
      videoTrackRef.current = null;
    }

    for (const track of mediaStreamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    mediaStreamRef.current = null;
    setPreviewStream(null);
    setError(null);
    setPhase("idle");
  }, [roomRef]);

  const start = useCallback(async (): Promise<boolean> => {
    const room = roomRef.current;
    if (!room || !connected) {
      setError("Connect to LiveKit before sharing your screen.");
      setPhase("error");
      return false;
    }

    if (publicationRef.current || mediaStreamRef.current) {
      await stop();
    }

    setError(null);
    setPhase("preparing");

    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error("Screen capture is not available in this environment.");
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 30, max: 30 },
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
        },
        audio: false,
      });

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        for (const track of stream.getTracks()) track.stop();
        throw new Error("No video track returned from screen capture.");
      }

      mediaStreamRef.current = stream;
      videoTrackRef.current = videoTrack;
      setPreviewStream(stream);

      videoTrack.onended = () => {
        void stop();
      };

      const publication = await room.localParticipant.publishTrack(videoTrack, {
        name: PRESENTATION_VIEWPORT_TRACK_NAME,
        source: Track.Source.ScreenShare,
        simulcast: true,
        videoEncoding: {
          maxBitrate: 2_500_000,
          maxFramerate: 30,
        },
      });

      publicationRef.current = publication;
      setPhase("live");
      console.log(
        "[Director] screen share published:",
        PRESENTATION_VIEWPORT_TRACK_NAME,
      );
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Screen share failed";
      if (/abort|cancel|denied|dismiss|NotAllowedError/i.test(message)) {
        setError(null);
        setPhase("idle");
        setPreviewStream(null);
        return false;
      }
      setError(message);
      setPhase("error");
      console.log("[Director] screen share error:", message);
      await stop();
      return false;
    }
  }, [connected, roomRef, stop]);

  useEffect(() => {
    if (!enabled) {
      void stop();
    }
  }, [enabled, stop]);

  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  return {
    phase,
    error,
    previewStream,
    hasPublication: publicationRef.current !== null,
    start,
    stop,
    presentationTrackSource: Track.Source.ScreenShare as const,
  };
}

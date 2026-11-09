"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  DEFAULT_MEETING_FORMAT,
  MeetingFormatIcon,
  type MeetingFormat,
} from "@backsteros/ui";
import { normalizeAudioLevel } from "@backsteros/meetings";

import {
  formatRoomTabMediaTooltip,
  getRoomTabMediaAudioLevel,
  getRoomTabMediaDiscrete,
  getRoomTabMediaDiscreteEpoch,
  subscribeRoomTabMediaAudio,
  subscribeRoomTabMediaDiscrete,
} from "../lib/room-tab-media-store";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Top product-tab meeting glyph with live media chrome (not the stage avatar):
 * - green pip = camera published
 * - amber pip = mic unmuted
 * - orange ring around the glyph grows with speech energy
 */
export function RoomTabMediaIcon({
  format = DEFAULT_MEETING_FORMAT,
  meetingId,
}: {
  format?: MeetingFormat;
  meetingId: string;
}) {
  useSyncExternalStore(
    subscribeRoomTabMediaDiscrete,
    getRoomTabMediaDiscreteEpoch,
    () => 0,
  );
  const discrete = getRoomTabMediaDiscrete(meetingId);
  const rootRef = useRef<HTMLSpanElement>(null);
  const micEnabledRef = useRef(discrete.micEnabled);
  micEnabledRef.current = discrete.micEnabled;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const paint = (rawLevel: number) => {
      const display =
        micEnabledRef.current && !prefersReducedMotion()
          ? normalizeAudioLevel(rawLevel)
          : 0;
      root.style.setProperty("--avatar-audio-level", String(display));
      root.dataset.audioLevel = display.toFixed(2);
    };

    paint(getRoomTabMediaAudioLevel(meetingId));
    const stop = subscribeRoomTabMediaAudio(meetingId, paint);

    let frame = 0;
    const tick = () => {
      if (micEnabledRef.current) {
        paint(getRoomTabMediaAudioLevel(meetingId));
      }
      frame = window.requestAnimationFrame(tick);
    };
    if (discrete.micEnabled) {
      frame = window.requestAnimationFrame(tick);
    }

    return () => {
      stop();
      window.cancelAnimationFrame(frame);
      paint(0);
    };
  }, [discrete.micEnabled, meetingId]);

  const statusLabel = formatRoomTabMediaTooltip(discrete);

  return (
    <span
      ref={rootRef}
      className={[
        "content-tab-icon",
        "content-tab-room-icon",
        discrete.micEnabled ? "is-mic-on" : null,
        discrete.cameraPublished ? "is-camera-on" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      data-meeting-id={meetingId}
      aria-label={statusLabel}
      title={statusLabel}
    >
      <MeetingFormatIcon format={format} size={14} />
      {discrete.cameraPublished ? (
        <span className="content-tab-room-icon__cam" aria-hidden="true" />
      ) : null}
      {discrete.micEnabled ? (
        <span className="content-tab-room-icon__mic" aria-hidden="true" />
      ) : null}
    </span>
  );
}

export function roomTabTooltip(
  meetingId: string | null,
  fallbackTitle: string,
): string {
  if (!meetingId) return fallbackTitle;
  const discrete = getRoomTabMediaDiscrete(meetingId);
  if (!discrete.cameraPublished && !discrete.micEnabled) {
    return fallbackTitle;
  }
  return `${fallbackTitle} — ${formatRoomTabMediaTooltip(discrete)}`;
}

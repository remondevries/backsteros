"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  MeetingFormatIcon,
  type MeetingFormat,
} from "@backsteros/ui";
import { normalizeAudioLevel } from "@backsteros/meetings";

import {
  formatRoomTabMediaTooltip,
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
 * Meeting-format tab glyph with a top-left live pip:
 * - green fill when the local camera track is published
 * - audio-level outline (avatar ring pattern) when mic is on and speaking
 * - mic-only stays outline-capable without a green fill
 */
export function RoomTabMediaIcon({
  format,
  meetingId,
}: {
  format: MeetingFormat;
  meetingId: string;
}) {
  useSyncExternalStore(
    subscribeRoomTabMediaDiscrete,
    getRoomTabMediaDiscreteEpoch,
    () => 0,
  );
  const discrete = getRoomTabMediaDiscrete(meetingId);
  const liveRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = liveRef.current;
    if (!el) return;
    return subscribeRoomTabMediaAudio(meetingId, (level) => {
      const display =
        discrete.micEnabled && !prefersReducedMotion()
          ? normalizeAudioLevel(level)
          : 0;
      el.style.setProperty("--avatar-audio-level", String(display));
    });
  }, [discrete.micEnabled, meetingId]);

  const showPip = discrete.cameraPublished || discrete.micEnabled;
  const statusLabel = formatRoomTabMediaTooltip(discrete);

  return (
    <span
      className="content-tab-icon content-tab-room-icon"
      aria-label={statusLabel}
      title={statusLabel}
    >
      <MeetingFormatIcon format={format} size={14} />
      {showPip ? (
        <span
          ref={liveRef}
          className={[
            "content-tab-room-icon__live",
            discrete.cameraPublished ? "is-camera-on" : "is-mic-only",
            discrete.micEnabled ? "is-mic-on" : "is-mic-muted",
          ].join(" ")}
          aria-hidden="true"
        />
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

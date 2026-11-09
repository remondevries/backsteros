"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import {
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

function applyTabAudioLevel(
  el: HTMLElement,
  micEnabled: boolean,
  rawLevel: number,
): void {
  const display =
    micEnabled && !prefersReducedMotion()
      ? normalizeAudioLevel(rawLevel)
      : 0;
  el.style.setProperty("--avatar-audio-level", String(display));
}

/**
 * Meeting-format tab glyph with a top-left live pip:
 * - green fill when the local camera track is published
 * - orange outline that tracks mic energy (same gated curve as the host avatar)
 * - mic-only uses a neutral idle fill so orange is reserved for speaking
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
  const rootRef = useRef<HTMLSpanElement>(null);
  const liveRef = useRef<HTMLSpanElement>(null);
  const micEnabledRef = useRef(discrete.micEnabled);
  micEnabledRef.current = discrete.micEnabled;

  useEffect(() => {
    const root = rootRef.current;
    const live = liveRef.current;
    if (!root) return;

    const paint = (level: number) => {
      const micOn = micEnabledRef.current;
      applyTabAudioLevel(root, micOn, level);
      if (live) applyTabAudioLevel(live, micOn, level);
    };

    paint(getRoomTabMediaAudioLevel(meetingId));
    return subscribeRoomTabMediaAudio(meetingId, paint);
  }, [discrete.cameraPublished, discrete.micEnabled, meetingId]);

  const showPip = discrete.cameraPublished || discrete.micEnabled;
  const statusLabel = formatRoomTabMediaTooltip(discrete);

  return (
    <span
      ref={rootRef}
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

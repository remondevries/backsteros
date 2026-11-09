"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  DEFAULT_MEETING_FORMAT,
  MeetingFormatIcon,
  type MeetingFormat,
} from "@backsteros/ui";

import {
  ROOM_TAB_AUDIO_LEVEL_VAR,
  roomTabAudioDisplayLevel,
  roomTabIconRootClassNames,
  roomTabLiveMarkerClassNames,
  shouldShowRoomTabLiveMarker,
} from "../lib/room-tab-media-indicator";
import {
  formatRoomTabMediaTooltip,
  getRoomTabMediaAudioLevel,
  getRoomTabMediaDiscrete,
  getRoomTabMediaDiscreteEpoch,
  subscribeRoomTabMediaAudio,
  subscribeRoomTabMediaDiscrete,
} from "../lib/room-tab-media-store";

/**
 * Top product-tab meeting glyph with live media chrome:
 * - one solid green pip fixed top-right while mic and/or camera is on
 * - green audio ring around that pip only while mic is unmuted
 * - no amber/orange states; ring keeps animating under reduced-motion
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
  const liveRef = useRef<HTMLSpanElement>(null);
  const micEnabledRef = useRef(discrete.micEnabled);
  micEnabledRef.current = discrete.micEnabled;
  const showLive = shouldShowRoomTabLiveMarker(discrete);

  useEffect(() => {
    if (!showLive || !discrete.micEnabled) {
      const live = liveRef.current;
      if (live) {
        live.style.setProperty(ROOM_TAB_AUDIO_LEVEL_VAR, "0");
        live.dataset.audioLevel = "0.00";
      }
      return;
    }

    const paint = (rawLevel: number) => {
      const live = liveRef.current;
      if (!live) return;
      const display = roomTabAudioDisplayLevel(
        rawLevel,
        micEnabledRef.current,
      );
      live.style.setProperty(ROOM_TAB_AUDIO_LEVEL_VAR, String(display));
      live.dataset.audioLevel = display.toFixed(2);
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
    frame = window.requestAnimationFrame(tick);

    return () => {
      stop();
      window.cancelAnimationFrame(frame);
      paint(0);
    };
  }, [discrete.micEnabled, meetingId, showLive]);

  const statusLabel = formatRoomTabMediaTooltip(discrete);

  return (
    <span
      className={roomTabIconRootClassNames(discrete).join(" ")}
      data-meeting-id={meetingId}
      data-live-anchor="top-right"
      aria-label={statusLabel}
      title={statusLabel}
    >
      <MeetingFormatIcon format={format} size={14} />
      {showLive ? (
        <span
          ref={liveRef}
          className={roomTabLiveMarkerClassNames(discrete).join(" ")}
          aria-hidden="true"
          data-live-anchor="top-right"
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

/**
 * Pure helpers for the room product-tab live marker.
 *
 * Visual contract (Remon, Nov 2026):
 * - One green dot, fixed top-right of the meeting-type glyph (never relocates).
 * - No amber/orange pips or glyph-level outline.
 * - Audio-responsive green ring surrounds that small green dot only.
 * - Levels come from published mic state; never invent / enable devices.
 */

import { normalizeAudioLevel } from "@backsteros/meetings";

import type { RoomTabMediaDiscrete } from "./room-tab-media-store.js";

/** CSS custom property written on the live pip (not the shell). */
export const ROOM_TAB_AUDIO_LEVEL_VAR = "--room-tab-audio-level";

/** Fixed anchor for the single live pip — never left / never relocates. */
export const ROOM_TAB_LIVE_ANCHOR = "top-right" as const;

export type RoomTabLiveAnchor = typeof ROOM_TAB_LIVE_ANCHOR;

/** Marker is mounted when camera and/or mic is actually on. */
export function shouldShowRoomTabLiveMarker(
  discrete: RoomTabMediaDiscrete,
): boolean {
  return discrete.cameraPublished || discrete.micEnabled;
}

/**
 * Class list for the single live pip. Position is always top-right via CSS;
 * these flags only style fill (camera) and the audio ring (mic).
 */
export function roomTabLiveMarkerClassNames(
  discrete: RoomTabMediaDiscrete,
): string[] {
  const classes = ["content-tab-room-icon__live"];
  if (discrete.cameraPublished) classes.push("is-camera-on");
  if (discrete.micEnabled) classes.push("is-mic-on");
  return classes;
}

/** Root room-tab icon classes — no mic/cam ring on the glyph itself. */
export function roomTabIconRootClassNames(
  discrete: RoomTabMediaDiscrete,
): string[] {
  return [
    "content-tab-icon",
    "content-tab-room-icon",
    discrete.cameraPublished ? "is-camera-on" : null,
    discrete.micEnabled ? "is-mic-on" : null,
  ].filter((value): value is string => Boolean(value));
}

/**
 * Display level for the dot-only ring. Mute / missing mic → 0.
 * Intentionally ignores prefers-reduced-motion so speech stays visible.
 */
export function roomTabAudioDisplayLevel(
  rawLevel: number,
  micEnabled: boolean,
): number {
  if (!micEnabled) return 0;
  return normalizeAudioLevel(rawLevel);
}

/** Forbidden chrome tones for this indicator (regression lock). */
export const ROOM_TAB_FORBIDDEN_INDICATOR_COLORS = [
  "#f97316",
  "rgb(249 115 22",
  "rgb(249, 115, 22",
  "amber",
] as const;

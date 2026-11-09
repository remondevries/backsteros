"use client";

import { useSyncExternalStore } from "react";
import {
  isMeetingRoomPath,
  parseMeetingRoomMeetingId,
  type ProductTab,
} from "@backsteros/ui";

import {
  getRoomTabMediaDiscreteEpoch,
  subscribeRoomTabMediaDiscrete,
} from "../lib/room-tab-media-store";
import { roomTabTooltip } from "./room-tab-media-icon";

/**
 * Subscribes to discrete room cam/mic flips so tab tooltips stay accurate
 * without audio-frame shell re-renders.
 */
export function useResolveRoomTabTooltip(): (tab: ProductTab) => string {
  useSyncExternalStore(
    subscribeRoomTabMediaDiscrete,
    getRoomTabMediaDiscreteEpoch,
    () => 0,
  );

  return (tab: ProductTab) => {
    if (!isMeetingRoomPath(tab.href)) return tab.title;
    const meetingId = parseMeetingRoomMeetingId(tab.href);
    return roomTabTooltip(meetingId, tab.title);
  };
}

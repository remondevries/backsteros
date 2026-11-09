import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DirectorRoom,
  type DirectorHostChromeSlots,
  type LocalMediaIndicator,
} from "@backsteros/meetings";
import "@backsteros/meetings/director.css";
import {
  formatMeetingDisplayId,
  normalizeMeetingFormat,
  RegisterPageIcon,
  RegisterPageTitle,
} from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";
import { useDesktopAvatarSrcMap } from "../lib/avatar-src";
import { getDefaultAssigneeId } from "../lib/default-assignee";
import {
  clearRoomTabMedia,
  setRoomTabMedia,
} from "../lib/room-tab-media-store";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import {
  useDesktopWorkspaceMeta,
  useDesktopWorkspacePeople,
} from "../lib/workspace-data";

/**
 * Persistent Director session for one open room tab. Stays mounted (and
 * LiveKit-connected) while the product tab exists — even when another tab is
 * active. Only unmount/teardown when that room tab closes.
 */
export function MeetingRoomSession({
  meetingRouteParam,
  active,
}: {
  meetingRouteParam: string;
  active: boolean;
}) {
  const { client } = useDesktopApi();
  const { meetings, ready } = useDesktopWorkspaceMeta();
  const { contacts } = useDesktopWorkspacePeople();
  const contactAvatarSrc = useDesktopAvatarSrcMap("contact", contacts);
  const [hostChrome, setHostChrome] = useState<DirectorHostChromeSlots | null>(
    null,
  );

  const meeting = useMemo(() => {
    const normalized = decodeURIComponent(meetingRouteParam).toLowerCase();
    return (
      meetings.find((entry) => {
        if (entry.id === meetingRouteParam) return true;
        const displayId = formatMeetingDisplayId(entry.number).toLowerCase();
        return displayId === normalized;
      }) ?? null
    );
  }, [meetingRouteParam, meetings]);

  const displayId = meeting ? formatMeetingDisplayId(meeting.number) : null;
  const title = meeting?.title?.trim() || "Meeting";
  const formatIcon = meeting
    ? normalizeMeetingFormat(meeting.format)
    : null;

  const hostAvatarSrc = useMemo(() => {
    const assigneeId = getDefaultAssigneeId();
    if (!assigneeId) return null;
    return contactAvatarSrc[assigneeId] ?? null;
  }, [contactAvatarSrc]);

  const meetingEntityId = meeting?.id ?? null;

  const handleLocalMediaIndicatorChange = useCallback(
    (next: LocalMediaIndicator | null) => {
      if (!meetingEntityId) return;
      setRoomTabMedia(meetingEntityId, next);
    },
    [meetingEntityId],
  );

  const handleHostChromeChange = useCallback(
    (next: DirectorHostChromeSlots | null) => {
      setHostChrome(next);
    },
    [],
  );

  // Clear tab media only when this session unmounts (room tab closed) — never
  // when the pane is merely backgrounded.
  useEffect(() => {
    if (!meetingEntityId) return;
    return () => {
      clearRoomTabMedia(meetingEntityId);
    };
  }, [meetingEntityId]);

  // Drop breadcrumb chrome ownership while backgrounded so other pages restore.
  useEffect(() => {
    if (active) return;
    setHostChrome(null);
  }, [active]);

  useDesktopSectionBreadcrumb(
    [
      { label: "Agenda", href: "/calendar" },
      {
        label: displayId ?? "Meeting",
        href: meeting
          ? `/calendar/meetings/${encodeURIComponent(meeting.id)}`
          : undefined,
      },
      { label: "Room" },
    ],
    {
      enabled: active && Boolean(meeting),
      leading: active ? (hostChrome?.roomOpen ?? null) : null,
      center: active ? (hostChrome?.presentation ?? null) : null,
      actions: active ? (hostChrome?.media ?? null) : null,
      hideEntityActionsSlot: true,
      className:
        active && hostChrome ? "meeting-room-breadcrumb-chrome" : undefined,
    },
  );

  // Only the active session uses `.meeting-room-page` so page-scroll :has()
  // flex-lock does not stick while the room is backgrounded under another tab.
  const rootClass = [
    "meeting-room-session",
    "flex",
    "min-h-0",
    "flex-1",
    "flex-col",
    active ? "meeting-room-page" : null,
  ]
    .filter(Boolean)
    .join(" ");

  if (!ready) {
    return (
      <div
        className={`${rootClass} items-center justify-center gap-2 p-6 text-sm text-muted-foreground`}
        aria-busy="true"
        aria-hidden={active ? undefined : true}
        data-meeting-room-state="loading"
        data-room-session-active={active ? "true" : "false"}
      >
        <p>Loading meeting room…</p>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div
        className={`${rootClass} items-center justify-center gap-2 p-6 text-sm`}
        aria-hidden={active ? undefined : true}
        data-meeting-room-state="not-found"
        data-room-session-active={active ? "true" : "false"}
      >
        <p>Meeting not found.</p>
        <p className="text-muted-foreground">
          Open Agenda, select the meeting, then Start room again.
        </p>
      </div>
    );
  }

  return (
    <div
      className={rootClass}
      aria-hidden={active ? undefined : true}
      data-meeting-room-state="ready"
      data-room-session-active={active ? "true" : "false"}
      data-meeting-id={meeting.id}
      style={{ height: "100%", minHeight: 0 }}
    >
      {active ? <RegisterPageTitle title={title} /> : null}
      {active ? <RegisterPageIcon icon={formatIcon} /> : null}
      <DirectorRoom
        meetingId={meeting.id}
        meetingTitle={title}
        meetingStartAt={
          typeof meeting.startAt === "string" ? meeting.startAt : null
        }
        hostAvatarSrc={hostAvatarSrc}
        chromePlacement="host"
        onHostChromeChange={active ? handleHostChromeChange : undefined}
        onLocalMediaIndicatorChange={handleLocalMediaIndicatorChange}
        requestJson={client.requestJson.bind(client)}
      />
    </div>
  );
}

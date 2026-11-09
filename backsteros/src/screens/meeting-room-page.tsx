import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "@tanstack/react-router";
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
 * In-app Director room for a meeting. Lazy-loaded so LiveKit stays out of the
 * main shell bundle until Start room opens a tab.
 */
export function MeetingRoomPage() {
  const { meetingId: meetingRouteParam } = useParams({
    strict: false,
  }) as { meetingId?: string };
  const { client } = useDesktopApi();
  const { meetings, ready } = useDesktopWorkspaceMeta();
  const { contacts } = useDesktopWorkspacePeople();
  const contactAvatarSrc = useDesktopAvatarSrcMap("contact", contacts);
  const [hostChrome, setHostChrome] = useState<DirectorHostChromeSlots | null>(
    null,
  );

  const meeting = useMemo(() => {
    if (!meetingRouteParam) return null;
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
  // Tab title is the meeting name only — format icon signals "room".
  const title = meeting?.title?.trim() || "Meeting";
  const formatIcon = meeting
    ? normalizeMeetingFormat(meeting.format)
    : null;

  const hostAvatarSrc = useMemo(() => {
    const assigneeId = getDefaultAssigneeId();
    if (!assigneeId) return null;
    // Same resolution path as Settings → Account / entity avatars.
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

  useEffect(() => {
    if (!meetingEntityId) return;
    return () => {
      clearRoomTabMedia(meetingEntityId);
    };
  }, [meetingEntityId]);

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
      leading: hostChrome?.roomOpen ?? null,
      center: hostChrome?.presentation ?? null,
      actions: hostChrome?.media ?? null,
      hideEntityActionsSlot: true,
      className: hostChrome ? "meeting-room-breadcrumb-chrome" : undefined,
    },
  );

  if (!ready) {
    return (
      <div
        className="meeting-room-page flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-sm text-muted-foreground"
        aria-busy="true"
        data-meeting-room-state="loading"
      >
        <p>Loading meeting room…</p>
      </div>
    );
  }

  if (!meetingRouteParam) {
    return (
      <div
        className="meeting-room-page flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-sm"
        data-meeting-room-state="missing-id"
      >
        <p>Missing meeting id in the room URL.</p>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div
        className="meeting-room-page flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-sm"
        data-meeting-room-state="not-found"
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
      className="meeting-room-page flex min-h-0 flex-1 flex-col"
      data-meeting-room-state="ready"
      style={{ height: "100%", minHeight: 0 }}
    >
      <RegisterPageTitle title={title} />
      <RegisterPageIcon icon={formatIcon} />
      <DirectorRoom
        meetingId={meeting.id}
        meetingTitle={title}
        meetingStartAt={
          typeof meeting.startAt === "string" ? meeting.startAt : null
        }
        hostAvatarSrc={hostAvatarSrc}
        chromePlacement="host"
        onHostChromeChange={handleHostChromeChange}
        onLocalMediaIndicatorChange={handleLocalMediaIndicatorChange}
        requestJson={client.requestJson.bind(client)}
      />
    </div>
  );
}

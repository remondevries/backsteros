import { useMemo } from "react";
import { useParams } from "@tanstack/react-router";
import { DirectorRoom } from "@backsteros/meetings";
import "@backsteros/meetings/director.css";
import {
  formatMeetingDisplayId,
  normalizeMeetingFormat,
  RegisterPageIcon,
  RegisterPageTitle,
} from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useDesktopWorkspaceMeta } from "../lib/workspace-data";

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

  useDesktopSectionBreadcrumb([
    { label: "Agenda", href: "/calendar" },
    {
      label: displayId ?? "Meeting",
      href: meeting
        ? `/calendar/meetings/${encodeURIComponent(meeting.id)}`
        : undefined,
    },
    { label: "Room" },
  ]);

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
        requestJson={client.requestJson.bind(client)}
      />
    </div>
  );
}

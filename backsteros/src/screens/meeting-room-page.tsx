import { useMemo } from "react";
import { useParams } from "@tanstack/react-router";
import { DirectorRoom } from "@backsteros/meetings";
import "@backsteros/meetings/director.css";
import { formatMeetingDisplayId, RegisterPageTitle } from "@backsteros/ui";

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
  const title = meeting?.title?.trim() || "Meeting room";

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
    return <div className="flex min-h-0 flex-1" />;
  }

  if (!meeting) {
    return (
      <div className="inbox-detail-empty">
        <p>Meeting not found.</p>
      </div>
    );
  }

  return (
    <div className="meeting-room-page flex min-h-0 flex-1 flex-col">
      <RegisterPageTitle title={`${displayId ?? "Meeting"} · Room`} />
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

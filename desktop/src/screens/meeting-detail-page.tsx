import { useCallback, useMemo } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";

import {
  formatMeetingDisplayId,
  MeetingDetailView,
  RegisterEntityDeleteAction,
  RegisterPageTitle,
} from "@backsteros/ui";

import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useMeetingDetailViewProps } from "../lib/use-meeting-detail-props";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { navigateToHref } from "../router/navigate-href";

export type MeetingDetailPageProps = {
  backHref?: string;
  breadcrumbItems?: { label: string; href?: string }[];
  /** When embedded (e.g. contact workspace), override the route param. */
  meetingRouteParam?: string;
};

export function MeetingDetailPage({
  backHref: backHrefProp,
  breadcrumbItems: breadcrumbItemsProp,
  meetingRouteParam: meetingRouteParamProp,
}: MeetingDetailPageProps = {}) {
  const navigate = useNavigate();
  const { meetingId: meetingRouteParamFromRoute } = useParams({
    strict: false,
  }) as {
    meetingId?: string;
  };
  const meetingRouteParam =
    meetingRouteParamProp ?? meetingRouteParamFromRoute;
  const workspace = useDesktopWorkspaceData();

  const meeting = useMemo(() => {
    if (!meetingRouteParam) return null;
    const normalized = decodeURIComponent(meetingRouteParam).toLowerCase();
    return workspace.meetings.find((entry) => {
      if (entry.id === meetingRouteParam) return true;
      const displayId = formatMeetingDisplayId(entry.number).toLowerCase();
      return displayId === normalized;
    });
  }, [meetingRouteParam, workspace.meetings]);

  const apiMeeting = useMemo(() => {
    if (!meeting) return null;
    return meeting;
  }, [meeting]);

  const displayId = meeting ? formatMeetingDisplayId(meeting.number) : null;
  const backHref = backHrefProp ?? "/calendar";
  const meetingLabel = displayId ?? meeting?.title ?? "Meeting";

  const breadcrumbItems = useMemo(() => {
    if (breadcrumbItemsProp) {
      return [...breadcrumbItemsProp, { label: meetingLabel }];
    }
    return [
      { label: "Calendar", href: "/calendar" },
      { label: meetingLabel },
    ];
  }, [breadcrumbItemsProp, meetingLabel]);

  useDesktopSectionBreadcrumb(breadcrumbItems);

  const patchMeeting = useCallback(
    (values: Record<string, unknown>) => {
      if (!meeting) return;
      void workspace.patchMeeting(meeting.id, values);
    },
    [meeting, workspace],
  );

  const detailProps = useMeetingDetailViewProps(
    apiMeeting,
    workspace,
    patchMeeting,
  );

  const handleDeleteMeeting = useCallback(async () => {
    if (!meeting) {
      return { ok: false as const, error: "Meeting is required." };
    }
    try {
      await workspace.softDeleteMeeting(meeting.id);
      navigateToHref(navigate, backHref, { replace: true });
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof Error ? error.message : "Failed to delete meeting.",
      };
    }
  }, [backHref, meeting, navigate, workspace]);

  if (!workspace.ready) {
    return <div className="flex min-h-0 flex-1" />;
  }

  if (!meeting) {
    return (
      <div className="inbox-detail-empty">
        <p>Meeting not found.</p>
        <button
          type="button"
          onClick={() => navigateToHref(navigate, backHref)}
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="meeting-detail-page">
      <RegisterPageTitle
        title={displayId ? `${displayId} ${meeting.title}` : meeting.title}
      />
      <RegisterEntityDeleteAction
        entityLabel={`meeting ${displayId ?? meeting.title}`}
        onDelete={handleDeleteMeeting}
      />
      <MeetingDetailView
        layout="page"
        displayId={displayId ?? "M-?"}
        title={meeting.title}
        summary={meeting.summary ?? ""}
        notes={meeting.notes ?? ""}
        transcription={meeting.transcription ?? ""}
        onTitleChange={(title) => patchMeeting({ title })}
        onSummaryChange={(summary) => patchMeeting({ summary })}
        onNotesChange={(notes) => patchMeeting({ notes })}
        onTranscriptionChange={(transcription) =>
          patchMeeting({ transcription })
        }
        {...detailProps}
      />
    </div>
  );
}
